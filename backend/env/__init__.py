"""The "next look" environment: where should the sharper instrument be consulted next?

An episode is one real run of overpasses over a region. The agent always has the MODIS detections; VIIRS is hidden.
At each scheduled look of a VIIRS platform it may spend one unit of a fixed budget to reveal the VIIRS detections
of that look inside one tile. The reward is the gain in the blind-test score of the reconstruction against every
real VIIRS detection of the episode, so the rewards of a round add up to the score at its end minus the score at
its start. Rewards are never computed from simulated truth; the only simulated episodes are in the unit tests and
are named as such.

Known limits, stated wherever results are shown. FIRMS lists detections, not where a satellite looked and saw
nothing, and it carries no cloud mask. The looks are the passes of each VIIRS platform whose swath held the whole
box, from NASA's pass list; where no list is cached for a window they are the nominal half-day slots of each
platform instead.
"""

_NO_CLOUD: str = (
    "FIRMS lists detections, not where a satellite looked and saw nothing, and has no cloud mask: a revealed tile "
    "with no detection may have been cloudy rather than free of fire. So a look that hands over no detection is "
    "taken as unknown: it teaches the model nothing and earns nothing."
)
_PASS_LIST: str = (
    " The looks are the passes of each VIIRS platform whose swath held the whole box, from NASA's pass list, at "
    "their real times and pixel sizes; a pass that held only part of the box is not a look."
)
_NOMINAL: str = (
    " The looks are the nominal half-day slots of each VIIRS platform, taken from the platform and the calendar "
    "and not from the hidden detections: nothing says the platform flew that half day or that its swath held the "
    "box, the real pass is up to about 90 minutes from a slot's time, sometimes comes twice, and its pixel size is "
    "not known in advance."
)

# By the schedule a round plays on (`backend.eval.schedule`: "cmr" is the pass list, "nominal" the fallback).
KNOWN_LIMITS_BY_SCHEDULE: dict[str, str] = {
    "cmr": _NO_CLOUD + _PASS_LIST,
    "nominal": _NO_CLOUD + _NOMINAL + " No pass list is cached for this window; with one the looks are the real passes.",
}
# What is said where no single round is meant: the default schedule, and what stands in where it is missing.
KNOWN_LIMITS: str = (
    _NO_CLOUD + _PASS_LIST + " Where no pass list is cached for a window the looks are the nominal half-day slots of "
    "each platform instead: the real pass is up to about 90 minutes from a slot's time, sometimes comes twice, and "
    "its pixel size is not known in advance."
)
