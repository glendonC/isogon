"""Harmonization of MODIS and VIIRS fire detections: candidate methods, the held-out interval, and the call the Record
makes.

The coarse satellites (MODIS on Terra and Aqua, 1 km at nadir, from 2000) and the sharp ones (VIIRS, 375 m, from
2012) count the same fires differently. Every method here predicts what Suomi NPP saw in a place and month (`V`)
from what MODIS saw there that month (`M`), with factors fitted on other months. The same functions predict summed
fire radiative power when given FRP in place of counts.

Inputs are arrays of shape (places, months) named by channel (see `CHANNELS`), a boolean mask over months saying
which months a method may fit on, and a `Places` structure for pooling across places. Every candidate is a pure
function of these: it reads nothing else and changes nothing. A month outside the mask can be predicted but never
fitted on, so leaving a year out of the mask is the held-out check.

The method in use (`in_use`, id `overlap_ratio_v1`) is one ratio per place: the place's Suomi NPP rows over its
MODIS rows over the fitted months.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Any, Callable

import numpy as np

PLATFORM_CODE: dict[str, str] = {"Terra": "T", "Aqua": "A", "Suomi NPP": "S", "NOAA-20": "J"}
N_SCAN: int = 4
# Channels of a table, each (places, months). `n_` counts rows, `frp_` sums FRP in MW, `area_` sums pixel area in
# km2, `low_` counts low confidence rows. `_D` and `_N` are day and night; `_s0` to `_s3` the classes of the coarse
# pixel's size across the swath.
CHANNELS: tuple[str, ...] = tuple(
    [f"{q}_{p}_{d}" for q in ("n", "frp") for p in "TASJ" for d in "DN"]
    + [f"{q}_{p}_s{k}" for q in ("n", "frp") for p in "TA" for k in range(N_SCAN)]
    + ["area_T", "area_A", "low_T", "low_A", "low_S"]
)

PSEUDO_ROWS: float = 30.0       # how many input rows a place's own ratio needs before it outweighs its prior
EMPTY_PSEUDO_MONTHS: float = 12.0
SIZE_BINS: int = 14             # bin 0: no input; bin b >= 1: input in [2^(b-1), 2^b) units, the last open
ERA_SHARP: tuple[int, ...] = (18 * 12 + 3,)                       # April 2018: NOAA-20 joins
ERA_DRIFT: tuple[int, ...] = (20 * 12 + 1, 21 * 12 + 11)          # February 2020 Terra, December 2021 Aqua
FIRST_YEAR: int = 2000
SCAN_MID_KM: np.ndarray = np.array([1.12, 1.5, 2.12, 3.65])   # middle of each MODIS scan class, km


@dataclass(frozen=True)
class Places:
    """What pooling needs about the places: the latitude band of each, and pairs of neighbouring places."""
    band: np.ndarray                     # (P,) int, an index of the place's latitude band
    nb_src: np.ndarray                   # (E,) int, a place
    nb_dst: np.ndarray                   # (E,) int, one of its neighbours (pairs are listed both ways)

    @property
    def n(self) -> int:
        return int(self.band.size)


@dataclass(frozen=True)
class Spec:
    """One candidate. `name` is its id in tables; the fields say what it does."""
    name: str
    label: str
    inputs: str = "modis"     # modis, terra, aqua, terra_aqua (two estimates blended), area, no_low_conf, scan_fit
    parts: str = "one"        # one ratio, or day_night (Suomi NPP day rows from MODIS day rows, night from night)
    groups: str = "none"      # none, month (of the year), era_sharp (NOAA-20 in orbit or not), era_drift
    pool: bool = False        # a place leans on its neighbours and its latitude band
    size: bool = False        # a factor that changes with the month's input, and a value for months with none
    sharp_fit: bool = False   # fit on the mean of Suomi NPP and NOAA-20 where both fly
    fallback: str = "none"    # a place with no ratio: none (no correction, as the method in use) or band


@dataclass
class Fit:
    """What a fit learned: for the record of a run, and for predicting one place as the world fit would."""
    world_ratio: float = float("nan")
    weights: dict[str, float] = field(default_factory=dict)
    band_ratio: np.ndarray = field(default_factory=lambda: np.zeros(0))
    size_factor: np.ndarray = field(default_factory=lambda: np.ones(SIZE_BINS))
    empty_band_mean: np.ndarray = field(default_factory=lambda: np.zeros(0))
    empty_world_mean: float = 0.0


def _year(month_index: np.ndarray) -> np.ndarray:
    return FIRST_YEAR + month_index // 12


def _inputs(X: dict[str, np.ndarray], inputs: str, q: str, scan_w: np.ndarray | None = None
            ) -> dict[str, np.ndarray]:
    """The MODIS input split into its day and night parts where it can be ({"D", "N"}), else one part ("all")."""
    if inputs in ("modis", "terra", "aqua"):
        plats = {"modis": "TA", "terra": "T", "aqua": "A"}[inputs]
        return {d: sum(X[f"{q}_{p}_{d}"] for p in plats) for d in "DN"}
    if inputs == "area":
        if q != "n":
            raise ValueError("area weighting is defined for counts")
        return {"all": X["area_T"] + X["area_A"]}
    if inputs == "no_low_conf":
        if q != "n":
            raise ValueError("the confidence filter is defined for counts")
        return {"all": sum(X[f"n_{p}_{d}"] for p in "TA" for d in "DN") - X["low_T"] - X["low_A"]}
    if inputs == "scan_fit":
        w = np.ones(N_SCAN) if scan_w is None else scan_w
        return {"all": sum(w[k] * (X[f"{q}_T_s{k}"] + X[f"{q}_A_s{k}"]) for k in range(N_SCAN))}
    raise ValueError(f"unknown inputs {inputs}")


def _target(X: dict[str, np.ndarray], q: str, sat: str = "S") -> dict[str, np.ndarray]:
    return {d: X[f"{q}_{sat}_{d}"] for d in "DN"}


def _shrink(num: np.ndarray, den: np.ndarray, prior: np.ndarray, k: float) -> np.ndarray:
    return (num + k * prior) / (den + k)


def _ratio(num: np.ndarray, den: np.ndarray) -> np.ndarray:
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(den > 0, num / np.where(den > 0, den, 1.0), np.nan)


def _group_of(months: np.ndarray, groups: str) -> np.ndarray:
    if groups == "none":
        return np.zeros(months.size, dtype=np.int64)
    if groups == "month":
        return months % 12
    edges = {"era_sharp": ERA_SHARP, "era_drift": ERA_DRIFT}[groups]
    return np.searchsorted(np.array(edges), months, side="right")


def place_ratio(V: np.ndarray, M: np.ndarray, places: Places, pool: bool, k: float) -> tuple[np.ndarray, np.ndarray, float]:
    """(ratio per place, ratio per band, world ratio) from training sums V, M of shape (P,). Without pooling a
    place's ratio is its own ratio of sums (nan with no input). With pooling it is shrunk toward the ratio of its
    neighbours, which is shrunk toward its band's, which is shrunk toward the world's."""
    world = float(V.sum() / M.sum()) if M.sum() > 0 else 1.0
    nb_band = int(places.band.max()) + 1 if places.n else 0
    bV = np.bincount(places.band, weights=V, minlength=nb_band)
    bM = np.bincount(places.band, weights=M, minlength=nb_band)
    band_r = _shrink(bV, bM, np.full(nb_band, world), k)
    if not pool:
        return _ratio(V, M), band_r, world
    nV = np.bincount(places.nb_src, weights=V[places.nb_dst], minlength=places.n)
    nM = np.bincount(places.nb_src, weights=M[places.nb_dst], minlength=places.n)
    nb_r = _shrink(nV, nM, band_r[places.band], k)
    return _shrink(V, M, nb_r, k), band_r, world


def fit_predict(X: dict[str, np.ndarray], months: np.ndarray, train: np.ndarray, spec: Spec, places: Places,
                q: str = "n", unit: float = 1.0, sharp_months: np.ndarray | None = None,
                fit_out: Fit | None = None) -> np.ndarray:
    """Predicted Suomi NPP (rows, or FRP when q is "frp") for every place and month, fitted on the months where
    `train` is True. `months` holds each column's month index from January 2000. `unit` is the size of one input
    row in the input's units (1 for counts, the mean FRP of a MODIS row for FRP); pseudo-counts are in rows."""
    if spec.inputs == "terra_aqua":
        e_t = fit_predict(X, months, train, replace(spec, inputs="terra"), places, q, unit, sharp_months)
        e_a = fit_predict(X, months, train, replace(spec, inputs="aqua"), places, q, unit, sharp_months)
        V = sum(_target(X, q).values())[:, train]
        best = min((float(np.abs(w * e_t[:, train] + (1 - w) * e_a[:, train] - V).sum()), w)
                   for w in np.linspace(0.0, 1.0, 21))
        if fit_out is not None:
            fit_out.weights["terra"] = best[1]
        return best[1] * e_t + (1.0 - best[1]) * e_a
    scan_w = None
    if spec.inputs == "scan_fit":
        scan_w = _scan_weights(X, months, train, spec, places, q, unit, sharp_months)
        if fit_out is not None:
            fit_out.weights.update({f"scan_{k}": float(w) for k, w in enumerate(scan_w)})
    Mp = _inputs(X, spec.inputs, q, scan_w)
    Vp = _target(X, q)
    if spec.sharp_fit and sharp_months is not None:
        J = _target(X, q, "J")
        both = sharp_months[None, :]
        Vfit = {d: np.where(both, 0.5 * (Vp[d] + J[d]), Vp[d]) for d in Vp}
    else:
        Vfit = Vp
    if spec.parts == "one" or "all" in Mp:
        Mp = {"all": sum(Mp.values())}
        Vfit = {"all": sum(Vfit.values())}
    k = PSEUDO_ROWS * unit
    tr = train.astype(bool)
    Vsum = {j: v[:, tr].sum(axis=1) for j, v in Vfit.items()}
    Msum = {j: m[:, tr].sum(axis=1) for j, m in Mp.items()}
    r_p, band_r, world = place_ratio(sum(Vsum.values()), sum(Msum.values()), places, spec.pool, k)
    if fit_out is not None:
        fit_out.world_ratio = world
        fit_out.band_ratio = band_r
    grp = _group_of(months, spec.groups)
    n_grp = int(grp.max()) + 1
    pred = np.zeros_like(next(iter(Mp.values())), dtype=np.float64)
    for j in Mp:
        # the world's factor for this part relative to the whole, so a place's part ratio has a sane prior
        g = (Vsum[j].sum() / Msum[j].sum()) / world if Msum[j].sum() > 0 and world > 0 else 1.0
        if j == "all":
            r_pj = r_p
        else:
            r_pj = _shrink(Vsum[j], Msum[j], r_p * g, k)
        for c in range(n_grp):
            in_c = grp == c
            if spec.groups == "none":
                r = r_pj
            else:
                sel = tr & in_c
                if not sel.any():
                    # a group with no fitted month (an era wholly left out) uses the place's ratio over all months
                    r = r_pj
                else:
                    r = _shrink(Vfit[j][:, sel].sum(axis=1), Mp[j][:, sel].sum(axis=1), r_pj, k)
            pred[:, in_c] += r[:, None] * Mp[j][:, in_c]
    M_all = sum(Mp.values())
    no_ratio = ~np.isfinite(r_p)
    if no_ratio.any():
        fill = band_r[places.band][no_ratio, None] * M_all[no_ratio] if spec.fallback == "band" else _plain_modis(X, q)[no_ratio]
        pred[no_ratio] = fill
    if spec.size:
        pred = _size_factor(pred, M_all, sum(Vp.values()), tr, places, unit, fit_out)
    return pred


def _plain_modis(X: dict[str, np.ndarray], q: str) -> np.ndarray:
    return sum(X[f"{q}_{p}_{d}"] for p in "TA" for d in "DN")


def size_bin(M: np.ndarray, unit: float) -> np.ndarray:
    """0 for no input; b for an input in [2^(b-1), 2^b) units; the last bin is open above."""
    with np.errstate(divide="ignore"):
        b = np.where(M > 0, np.floor(np.log2(np.maximum(M / unit, 1e-12))) + 2, 0)
    return np.clip(b, 0, SIZE_BINS - 1).astype(np.int64)


def _size_factor(pred: np.ndarray, M: np.ndarray, V: np.ndarray, tr: np.ndarray, places: Places, unit: float,
                 fit_out: Fit | None = None) -> np.ndarray:
    """A world factor for each size of the month's input, fitted on the training months, and for months with no
    input the place's mean Suomi NPP value in such months, shrunk toward its band's."""
    b = size_bin(M, unit)
    bt, pt, vt = b[:, tr], pred[:, tr], V[:, tr]
    num = np.bincount(bt.ravel(), weights=vt.ravel(), minlength=SIZE_BINS)
    den = np.bincount(bt.ravel(), weights=pt.ravel(), minlength=SIZE_BINS)
    f = np.where(den > 0, num / np.where(den > 0, den, 1.0), 1.0)
    out = pred * f[b]
    empty_t = bt == 0
    n0 = empty_t.sum(axis=1).astype(np.float64)
    v0 = np.where(empty_t, vt, 0.0).sum(axis=1)
    nb_band = int(places.band.max()) + 1
    bn = np.bincount(places.band, weights=n0, minlength=nb_band)
    bv = np.bincount(places.band, weights=v0, minlength=nb_band)
    world = v0.sum() / n0.sum() if n0.sum() > 0 else 0.0
    band_mean = _shrink(bv, bn, np.full(nb_band, world), EMPTY_PSEUDO_MONTHS)
    alpha = _shrink(v0, n0, band_mean[places.band], EMPTY_PSEUDO_MONTHS)
    if fit_out is not None:
        fit_out.size_factor, fit_out.empty_band_mean, fit_out.empty_world_mean = f, band_mean, float(world)
    return np.where(b == 0, alpha[:, None], out)


def _scan_weights(X: dict[str, np.ndarray], months: np.ndarray, train: np.ndarray, spec: Spec, places: Places,
                  q: str, unit: float, sharp_months: np.ndarray | None) -> np.ndarray:
    """Weights of the coarse pixel's size classes: (the class's middle scan / the narrowest class's) to a power
    fitted on the training months, the power that gives the lowest training monthly error of a ratio per place."""
    tr = train.astype(bool)
    rel = SCAN_MID_KM / SCAN_MID_KM[0]
    V = sum(_target(X, q).values())[:, tr]
    best = (np.inf, np.ones(N_SCAN))
    for gamma in np.linspace(-1.5, 3.0, 19):
        w = rel ** gamma
        Mw = sum(w[k] * (X[f"{q}_T_s{k}"] + X[f"{q}_A_s{k}"]) for k in range(N_SCAN))[:, tr]
        r_p, band_r, _ = place_ratio(V.sum(axis=1), Mw.sum(axis=1), places, spec.pool, PSEUDO_ROWS * unit)
        r = np.where(np.isfinite(r_p), r_p, band_r[places.band])
        err = float(np.abs(r[:, None] * Mw - V).sum())
        if err < best[0]:
            best = (err, w)
    return best[1]


# The candidates. Each is a Spec; `candidate(name)` gives the pure function that predicts with it.
SPECS: tuple[Spec, ...] = (
    Spec("none", "No correction: MODIS rows as they are"),
    Spec("in_use", "Method in use: one ratio per place (overlap_ratio_v1)"),
    Spec("month", "One ratio per month of the year, shrunk toward the place's ratio", groups="month"),
    Spec("day_night", "Day rows from day rows, night rows from night rows", parts="day_night"),
    Spec("area", "MODIS rows weighted by their pixel area", inputs="area"),
    Spec("scan_fit", "MODIS rows weighted by their pixel size class, the weight's power fitted", inputs="scan_fit"),
    Spec("terra_aqua", "Terra and Aqua apart: two estimates, blended by a fitted weight", inputs="terra_aqua"),
    Spec("aqua", "Aqua alone, the afternoon pass closest to Suomi NPP's", inputs="aqua"),
    Spec("era_sharp", "A ratio for Suomi NPP alone and one for the years with NOAA-20", groups="era_sharp"),
    Spec("sharp_fit", "Fitted on the mean of Suomi NPP and NOAA-20 where both fly", sharp_fit=True),
    Spec("era_drift", "A ratio for each stretch of MODIS orbit drift", groups="era_drift"),
    Spec("size", "A factor that changes with the month's count, and a value for months MODIS saw nothing", size=True),
    Spec("no_low_conf", "Low confidence MODIS rows left out of the input", inputs="no_low_conf"),
    Spec("pooled", "One ratio per place, leaning on its neighbours and its latitude band", pool=True, fallback="band"),
    # combinations of the single changes that did not lose, made after the singles were scored
    Spec("pooled_size", "Pooled, with the factor that changes with the month's count", pool=True, size=True,
         fallback="band"),
    Spec("pooled_month_size", "Pooled, by month of the year, with the count factor", pool=True, size=True,
         groups="month", fallback="band"),
    Spec("combined", "Pooled, by month of the year, day and night apart, the count factor, fitted on both sharp "
         "satellites", pool=True, size=True, groups="month", parts="day_night", sharp_fit=True, fallback="band"),
)
SPEC_BY_NAME: dict[str, Spec] = {s.name: s for s in SPECS}
FRP_SKIP: frozenset[str] = frozenset({"area", "no_low_conf"})


def predict_none(X: dict[str, np.ndarray], q: str = "n") -> np.ndarray:
    return _plain_modis(X, q).astype(np.float64)


def candidate(spec: Spec) -> Callable[..., np.ndarray]:
    """The pure function of one candidate: (X, months, train, places, q, unit, sharp_months) -> predictions."""
    def run(X: dict[str, np.ndarray], months: np.ndarray, train: np.ndarray, places: Places, q: str = "n",
            unit: float = 1.0, sharp_months: np.ndarray | None = None, fit_out: Fit | None = None) -> np.ndarray:
        if spec.name == "none":
            return predict_none(X, q)
        return fit_predict(X, months, train, spec, places, q, unit, sharp_months, fit_out)
    run.__name__ = f"predict_{spec.name}"
    return run


def held_out(X: dict[str, np.ndarray], months: np.ndarray, clean: np.ndarray, spec: Spec, places: Places,
             q: str = "n", unit: float = 1.0, sharp_months: np.ndarray | None = None,
             years: tuple[int, ...] | None = None) -> np.ndarray:
    """Every overlap year left out in turn, everywhere at once: the prediction of each clean month made by a fit on
    the clean months of the other years. nan outside the clean months."""
    run = candidate(spec)
    yr = _year(months)
    out = np.full(next(iter(X.values())).shape, np.nan)
    for y in years or tuple(sorted(set(yr[clean].tolist()))):
        test = clean & (yr == y)
        if not test.any():
            continue
        p = run(X, months, clean & (yr != y), places, q, unit, sharp_months)
        out[:, test] = p[:, test]
    return out


# The interval. Built from held-out errors only: pairs of (prediction, observation) whose year was left out of the
# fit that made the prediction. The error is the log of (observed + one unit) over (predicted + one unit); its 10th
# and 90th percentiles are taken among predictions of about the same size, so the interval is wider where the
# predicted count is small.
LEVEL: float = 0.80
INTERVAL_BINS: int = 16          # bin 0: predictions under one unit; bin b: [2^(b-1), 2^b) units; the last open
INTERVAL_MIN_PAIRS: int = 100


def interval_bin(pred: np.ndarray, unit: float) -> np.ndarray:
    x = np.asarray(pred, dtype=np.float64) / unit
    with np.errstate(divide="ignore"):
        b = np.where(x >= 1.0, np.floor(np.log2(np.maximum(x, 1.0))) + 1, 0)
    return np.clip(b, 0, INTERVAL_BINS - 1).astype(np.int64)


def interval_table(pred: np.ndarray, obs: np.ndarray, unit: float = 1.0, level: float = LEVEL,
                   min_pairs: int = INTERVAL_MIN_PAIRS, fallback: dict[str, Any] | None = None) -> dict[str, Any]:
    """Quantiles of the held-out log error per size bin of the prediction. A bin with fewer than `min_pairs` pairs
    takes the bin of `fallback` (the world's table for a band's) when one is given, and otherwise borrows the pairs
    of the bins next to it, widening on both sides until it has enough."""
    pred = np.asarray(pred, dtype=np.float64).ravel()
    obs = np.asarray(obs, dtype=np.float64).ravel()
    ok = np.isfinite(pred) & np.isfinite(obs)
    pred, obs = pred[ok], obs[ok]
    z = np.log((obs + unit) / (np.maximum(pred, 0.0) + unit))
    b = interval_bin(pred, unit)
    a = (1.0 - level) / 2.0
    lo, hi, n_used = np.full(INTERVAL_BINS, np.nan), np.full(INTERVAL_BINS, np.nan), np.zeros(INTERVAL_BINS, int)
    counts = np.bincount(b, minlength=INTERVAL_BINS)
    order = np.argsort(b, kind="stable")
    starts = np.concatenate([[0], np.cumsum(counts)])
    for k in range(INTERVAL_BINS):
        if fallback is not None and counts[k] < min_pairs:
            lo[k], hi[k], n_used[k] = fallback["log_lo"][k], fallback["log_hi"][k], -1
            continue
        w = 0
        while True:
            k0, k1 = max(0, k - w), min(INTERVAL_BINS - 1, k + w)
            n = starts[k1 + 1] - starts[k0]
            if n >= min_pairs or (k0 == 0 and k1 == INTERVAL_BINS - 1):
                break
            w += 1
        if n == 0:
            continue
        zz = z[order[starts[k0]:starts[k1 + 1]]]
        lo[k], hi[k] = np.quantile(zz, a), np.quantile(zz, 1.0 - a)
        n_used[k] = n
    return {"level": level, "unit": unit, "bins": INTERVAL_BINS, "log_lo": lo.tolist(), "log_hi": hi.tolist(),
            "pairs": n_used.tolist(), "pairs_in_bin": counts.tolist(), "bins_from_fallback": int((n_used < 0).sum()),
            "definition": "bin 0 holds predictions under one unit, bin b predictions in [2^(b-1), 2^b) units; "
                          "interval = (prediction + unit) x exp(quantile) - unit, clipped at 0"}


def apply_interval(pred: np.ndarray, table: dict[str, Any]) -> tuple[np.ndarray, np.ndarray]:
    unit = float(table["unit"])
    b = interval_bin(np.maximum(pred, 0.0), unit)
    lo = np.array(table["log_lo"], dtype=np.float64)[b]
    hi = np.array(table["log_hi"], dtype=np.float64)[b]
    base = np.maximum(pred, 0.0) + unit
    return np.maximum(base * np.exp(lo) - unit, 0.0), np.maximum(base * np.exp(hi) - unit, 0.0)


# The Record's call. Which method it serves is one field of `backend/model/harmonize_fitted.py` (`serve`), set from
# the rule's decision; the interval comes from the held-out errors of the method served and covers what it states.
INTERVAL_ID: str = "heldout_log_error_quantiles_v1"
FIRST_FIT_MONTH: str = "2012-02"     # Suomi NPP rows begin on 20 January 2012: that month is partial
TERRA_ONLY: Spec = Spec("terra_only", "Terra alone, as the Record harmonizes the months before Aqua", inputs="terra")
# Each method the Record can serve, with the candidate it is and that candidate on Terra alone (before Aqua).
SERVED: dict[str, tuple[Spec, Spec]] = {
    "overlap_ratio_v1": (SPEC_BY_NAME["in_use"], TERRA_ONLY),
    "pooled_month_size_v1": (SPEC_BY_NAME["pooled_month_size"],
                             replace(SPEC_BY_NAME["pooled_month_size"], name="pooled_month_size_terra", inputs="terra")),
}
SERVED_WHAT: dict[str, str] = {
    "overlap_ratio_v1": "Suomi NPP equivalent rows = MODIS rows (Terra plus Aqua) x the place's ratio of Suomi NPP "
                        "rows to MODIS rows over its clean overlap months; Terra alone x its own ratio before Aqua",
    "pooled_month_size_v1": "Suomi NPP equivalent rows = MODIS rows (Terra plus Aqua) x the place's ratio for that "
                            "month of the year x a factor for the size of the month's MODIS count. The month's ratio "
                            "leans on the place's ratio over the year, which leans on its surroundings and its "
                            "latitude band; a month in which MODIS saw nothing gets the place's mean Suomi NPP count "
                            "in such months. Terra alone, fitted the same way, before Aqua",
}


def _total(rc: dict[str, Any], plat: str, quantity: str = "rows") -> float | None:
    c = (rc or {}).get(plat)
    if c is None:
        return None
    if quantity == "frp":
        return float(c["frp"])
    return float(c.get("total", c.get("day", 0) + c.get("night", 0)))


def _clean(rc: dict[str, Any], plats: tuple[str, ...]) -> bool:
    return all((rc or {}).get(p) is not None and not (rc[p].get("outage_days") or 0) for p in plats)


def _band_key(lat: float | None) -> str | None:
    return None if lat is None else f"{float(np.floor(lat / 10.0) * 10.0):g}"


def tables_for(lat: float | None, tables: dict[str, Any], scale: str, regime: str) -> tuple[dict[str, Any], str]:
    """The interval table of a latitude band where the fit had one, else the world's."""
    t = tables[scale][regime]
    key = _band_key(lat)
    if key is not None and key in t["bands"]:
        return t["bands"][key], f"band {key}"
    return t["world"], "world"


def served_params(fit: "Fit", places: Places, unit: float) -> dict[str, Any]:
    """What a single place needs from the world fit to be predicted like every place of it: the world's and each
    band's ratio, the factor for each size of the month's count, and each band's mean in months MODIS saw nothing."""
    south = lambda i: f"{float(i) * 10.0 - 90.0:g}"  # noqa: E731
    return {"world_ratio": fit.world_ratio, "unit": unit, "pseudo_rows": PSEUDO_ROWS,
            "empty_pseudo_months": EMPTY_PSEUDO_MONTHS,
            "band_ratio": {south(i): float(r) for i, r in enumerate(fit.band_ratio)},
            "size_factor": [float(v) for v in fit.size_factor],
            "empty_band_mean": {south(i): float(v) for i, v in enumerate(fit.empty_band_mean)},
            "empty_world_mean": fit.empty_world_mean}


def served_predict(V: np.ndarray, M: np.ndarray, month_of_year: np.ndarray, fit: np.ndarray, params: dict[str, Any],
                   lat: float | None, prior_V: float = 0.0, prior_M: float = 0.0) -> np.ndarray:
    """One place's predictions by the pooled, month of the year, count factor method (the candidate
    `pooled_month_size`), as `fit_predict` makes them for a place of the world fit. `fit` marks the months it may
    fit on; `prior_V`, `prior_M` are its surroundings' Suomi NPP and MODIS sums over those months (zero when they
    are not known, and then the place leans on its band alone)."""
    k = params["pseudo_rows"] * params["unit"]
    key = _band_key(lat)
    r_band = params["band_ratio"].get(key, params["world_ratio"]) if key else params["world_ratio"]
    r_nb = float(_shrink(np.float64(prior_V), np.float64(prior_M), np.float64(r_band), k))
    ok = fit & np.isfinite(V) & np.isfinite(M)
    r_p = float(_shrink(np.float64(V[ok].sum()), np.float64(M[ok].sum()), np.float64(r_nb), k))
    r_c = np.array([float(_shrink(np.float64(V[ok & (month_of_year == c)].sum()),
                                  np.float64(M[ok & (month_of_year == c)].sum()), np.float64(r_p), k))
                    for c in range(12)])
    Mz = np.where(np.isfinite(M), M, 0.0)
    pred = r_c[month_of_year] * Mz
    b = size_bin(Mz, params["unit"])
    pred = pred * np.array(params["size_factor"])[b]
    empty = ok & (Mz == 0)
    band_mean = params["empty_band_mean"].get(key, params["empty_world_mean"]) if key else params["empty_world_mean"]
    alpha = float(_shrink(np.float64(V[empty].sum()), np.float64(empty.sum()), np.float64(band_mean),
                          params["empty_pseudo_months"]))
    pred = np.where(b == 0, alpha, pred)
    return np.where(np.isfinite(M), pred, np.nan)


def surround_from_cube(box: tuple[float, float, float, float], grow_deg: float = 2.0) -> dict[str, Any] | None:
    """Fire rows of the box grown by `grow_deg` on every side, per month and platform, from the fire cube; None when
    no cube is on hand. The Record subtracts its own rows to get its surroundings."""
    try:
        from backend.firms.cube import Cube, month_label
    except ImportError:
        return None
    w, s, e, n = box
    try:
        cube = Cube()
        t = cube.box((max(-180.0, w - grow_deg), max(-90.0, s - grow_deg), min(180.0, e + grow_deg),
                      min(90.0, n + grow_deg)))
        build = cube.build_id() if callable(cube.build_id) else cube.build_id
    except Exception:  # noqa: BLE001  any missing or unreadable cube means: no surroundings
        return None
    rows = t["rows"][..., 0].sum(axis=2)          # (months, platform), fire rows (kind 0), day and night together
    return {"year_month": [month_label(m) for m in range(rows.shape[0])], "Terra": rows[:, 0], "Aqua": rows[:, 1],
            "Suomi NPP": rows[:, 2], "box": t["box"], "build": build}


def record_series(records: list[dict[str, Any]], area_km2: float | None = None, center_lat: float | None = None,
                  closed_years: tuple[int, ...] = (), fitted: dict[str, Any] | None = None,
                  quantity: str = "rows", surround: dict[str, Any] | None = None) -> dict[str, Any]:
    """Monthly tables in, the harmonized series with its interval out.

    `records` are the Record route's monthly records (each with `year_month` and `raw_counts` per platform, a
    platform's entry null when it delivers no data that month, with `total` and `outage_days`). `area_km2` gives
    rates per 1000 km2 per day beside counts. `center_lat` picks the interval table of the place's band.
    `closed_years` are years whose held-out check is neither computed nor published (a test fire's year).
    `surround` (from `surround_from_cube`) gives the rows around the place, which the pooled method leans on.
    With `quantity="frp"` each platform's entry must carry `frp`, its summed fire radiative power in MW, and the
    series is Suomi NPP equivalent FRP; FRP is served by the method in use whatever rows are served by."""
    if fitted is None:
        from backend.model.harmonize_fitted import FITTED as fitted
    method = fitted["serve"]["frp" if quantity == "frp" else "rows"]
    tables = fitted["methods"][method]
    pre = "frp_" if quantity == "frp" else ""
    ym = [r["year_month"] for r in records]
    rc = [r.get("raw_counts") or {} for r in records]

    def series(plat: str) -> np.ndarray:
        return np.array([_total(c, plat, quantity) if c.get(plat) is not None else np.nan for c in rc])

    T, A, S = series("Terra"), series("Aqua"), series("Suomi NPP")
    year = np.array([int(m[:4]) for m in ym])
    moy = np.array([int(m[5:7]) - 1 for m in ym])
    fit_ta = np.array([m >= FIRST_FIT_MONTH and _clean(c, ("Suomi NPP", "Terra", "Aqua")) for m, c in zip(ym, rc)])
    fit_t = np.array([m >= FIRST_FIT_MONTH and _clean(c, ("Suomi NPP", "Terra")) for m, c in zip(ym, rc)])
    MA = T + A
    prior_note = None
    sur_T = sur_A = sur_S = None
    if method != "overlap_ratio_v1" and surround is not None and quantity == "rows":
        idx = {m: i for i, m in enumerate(surround["year_month"])}
        pick = lambda a: np.array([float(a[idx[m]]) if m in idx else np.nan for m in ym])  # noqa: E731
        sur_T, sur_A, sur_S = pick(surround["Terra"]), pick(surround["Aqua"]), pick(surround["Suomi NPP"])
        prior_note = f"surroundings: the box grown to {surround.get('box')}, from the fire cube, less the place's rows"
    elif method != "overlap_ratio_v1":
        prior_note = "no surroundings given: the place leans on its latitude band"

    def prior(fit: np.ndarray, own_M: np.ndarray, sM: np.ndarray | None) -> tuple[float, float]:
        if sM is None:
            return 0.0, 0.0
        ok = fit & np.isfinite(sM) & np.isfinite(sur_S) & np.isfinite(own_M) & np.isfinite(S)
        return (max(0.0, float(sur_S[ok].sum() - S[ok].sum())), max(0.0, float(sM[ok].sum() - own_M[ok].sum())))

    def predict(M: np.ndarray, fit: np.ndarray, regime: str, sM: np.ndarray | None) -> tuple[np.ndarray, Any]:
        if method == "overlap_ratio_v1":
            d = float(np.nansum(M[fit]))
            r = float(np.nansum(S[fit]) / d) if d > 0 else None
            return (r * M if r is not None else np.full(M.shape, np.nan)), r
        pv, pm = prior(fit, M, sM)
        return served_predict(S, M, moy, fit, tables["params"][pre + regime], center_lat, pv, pm), {"prior_suomi_npp": pv,
                                                                                                    "prior_modis": pm}

    p_ta, info_ta = predict(MA, fit_ta, "terra_aqua", None if sur_T is None else sur_T + sur_A)
    p_t, info_t = predict(T, fit_t, "terra_only", sur_T)
    tab_ta, where_ta = tables_for(center_lat, tables, "month", pre + "terra_aqua")
    tab_t, where_t = tables_for(center_lat, tables, "month", pre + "terra_only")
    pred = np.full(len(records), np.nan)
    lo_m = np.full(len(records), np.nan)
    hi_m = np.full(len(records), np.nan)
    used: list[str | None] = []
    for i in range(len(records)):
        if np.isfinite(MA[i]) and np.isfinite(p_ta[i]):
            p, tab, u = p_ta[i], tab_ta, "terra_aqua"
        elif np.isfinite(T[i]) and np.isfinite(p_t[i]):
            p, tab, u = p_t[i], tab_t, "terra_only"
        else:
            used.append(None)
            continue
        lo, hi = apply_interval(np.array([p]), tab)
        pred[i], lo_m[i], hi_m[i] = p, float(lo[0]), float(hi[0])
        used.append(u)
    out_months = []
    for i, m in enumerate(ym):
        row: dict[str, Any] = {"year_month": m, "ratio_used": used[i],
                               "harmonized_count": None if np.isnan(pred[i]) else round(float(pred[i]), 2),
                               "p10_count": None if np.isnan(lo_m[i]) else round(float(lo_m[i]), 2),
                               "p90_count": None if np.isnan(hi_m[i]) else round(float(hi_m[i]), 2)}
        if area_km2:
            import calendar as _c

            days = _c.monthrange(int(m[:4]), int(m[5:7]))[1]
            k = 1.0 / (area_km2 / 1000.0) / days
            for a, b in (("harmonized_count", "harmonized_rate"), ("p10_count", "p10_rate"), ("p90_count", "p90_rate")):
                row[b] = None if row[a] is None else round(row[a] * k, 4)
        out_months.append(row)
    tab_y, where_y = tables_for(center_lat, tables, "year", pre + "terra_aqua")
    out_years = []
    for y in sorted(set(year.tolist())):
        sel = (year == y) & np.isfinite(pred)
        if not sel.any():
            continue
        s = float(pred[sel].sum())
        lo, hi = apply_interval(np.array([s]), tab_y)
        out_years.append({"year": int(y), "months": int(sel.sum()), "harmonized_count": round(s, 1),
                          "p10_count": round(float(lo[0]), 1), "p90_count": round(float(hi[0]), 1)})

    def check_predict(fit: np.ndarray) -> np.ndarray:
        return predict(MA, fit, "terra_aqua", None if sur_T is None else sur_T + sur_A)[0]

    fitted_on: dict[str, Any] = {"months": [m for m, f in zip(ym, fit_ta) if f],
                                 "suomi_npp_rows": float(np.nansum(S[fit_ta])), "modis_rows": float(np.nansum(MA[fit_ta]))}
    if method == "overlap_ratio_v1":
        fitted_on.update({"ratio_terra_aqua": info_ta, "ratio_terra_only": info_t})
    else:
        fitted_on.update({"prior": prior_note, **info_ta,
                          "ratio_over_the_overlap": (float(np.nansum(S[fit_ta]) / np.nansum(MA[fit_ta]))
                                                     if np.nansum(MA[fit_ta]) > 0 else None)})
    return {
        "method": {
            "id": method,
            "quantity": quantity,
            "unit": "MW of fire radiative power" if quantity == "frp" else "rows",
            "what": SERVED_WHAT[method],
            "fitted_on": fitted_on,
            "fit_months_rule": f"from {FIRST_FIT_MONTH}, months in which Suomi NPP, Terra and Aqua each deliver with no "
                               "outage day",
            "interval": {"id": INTERVAL_ID, "level": fitted["level"], "tables": pre + "terra_aqua", "table_month": where_ta,
                         "table_month_terra_only": where_t, "table_year": where_y,
                         "what": "the 10th to 90th percentile of held-out errors of predictions of about the same "
                                 "size, from every overlap year left out in turn over every place of the fit",
                         "fitted_on": fitted["provenance"]},
        },
        "months": out_months,
        "years": out_years,
        "check": record_check(S, MA, year, fit_ta, tab_ta, tab_y, closed_years, check_predict),
    }


def record_check(S: np.ndarray, M: np.ndarray, year: np.ndarray, fit: np.ndarray, tab_m: dict[str, Any],
                 tab_y: dict[str, Any], closed_years: tuple[int, ...] = (),
                 predict: Callable[[np.ndarray], np.ndarray] | None = None) -> dict[str, Any]:
    """The place's own held-out check: each overlap year left out in turn, the method fitted on the others (by
    `predict`, given the months it may fit on; one ratio of sums when not given). Closed years are not held out and
    their figures are not given."""
    rows = []
    inside_m = []
    for y in sorted(set(year[fit].tolist())):
        if y in closed_years:
            continue
        tr, te = fit & (year != y), fit & (year == y)
        if predict is None:
            d = float(M[tr].sum())
            if d <= 0:
                continue
            p = float(S[tr].sum()) / d * M[te]
        else:
            p = predict(tr)[te]
            if not np.isfinite(p).all():
                continue
        lo, hi = apply_interval(p, tab_m)
        inside_m.extend(((S[te] >= lo - 1e-9) & (S[te] <= hi + 1e-9)).tolist())
        vo, vp = float(S[te].sum()), float(p.sum())
        ylo, yhi = apply_interval(np.array([vp]), tab_y)
        rows.append({"year": int(y), "months": int(te.sum()), "suomi_npp_observed": vo, "predicted": round(vp, 1),
                     "relative_error": round((vp - vo) / vo, 4) if vo > 0 else None,
                     "relative_error_without_harmonization": round((float(M[te].sum()) - vo) / vo, 4) if vo > 0 else None,
                     "inside_interval": bool(ylo[0] - 1e-9 <= vo <= yhi[0] + 1e-9)})
    errs = [abs(r["relative_error"]) for r in rows if r["relative_error"] is not None]
    naive = [abs(r["relative_error_without_harmonization"]) for r in rows if r["relative_error_without_harmonization"] is not None]
    return {
        "per_year": rows,
        "years_not_held_out": sorted(int(y) for y in closed_years if y in set(year[fit].tolist())),
        "median_abs_relative_error_annual": round(float(np.median(errs)), 4) if errs else None,
        "median_abs_relative_error_without_harmonization": round(float(np.median(naive)), 4) if naive else None,
        "annual_interval_coverage": round(float(np.mean([r["inside_interval"] for r in rows])), 4) if rows else None,
        "monthly_interval_coverage": round(float(np.mean(inside_m)), 4) if inside_m else None,
        "months_tested": len(inside_m),
        "interval_note": "the interval checked here is the one in use, whose table holds held-out errors of every "
                         "year in other places, and the world factors of the pooled method are fitted on every "
                         "year; the coverage measured on years that did not set the table is in "
                         "docs/harmonization.md",
    }
