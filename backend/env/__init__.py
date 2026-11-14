"""The "next look" environment: where should the sharper instrument be consulted next?

An episode is one real run of overpasses over a region. The agent always has the MODIS detections; VIIRS is hidden.
At each scheduled look of a VIIRS platform it may spend one unit of a fixed budget to reveal the VIIRS detections
of that look inside one tile. The reward is the gain in the blind-test score of the reconstruction against the
real VIIRS detections of the episode. Rewards are never computed from simulated truth; the only simulated episodes
are in the unit tests and are named as such.

Known limits, stated wherever results are shown. FIRMS lists detections, not where a satellite looked and saw
nothing, and it carries no cloud mask. The looks are the nominal half-day slots of each VIIRS platform (two a day
each, from the platform and the calendar): VIIRS sees every point on Earth on each of them, but the real pass is
up to about 90 minutes from the slot's time, sometimes comes twice, and its pixel size is not known in advance.
"""

KNOWN_LIMITS: str = (
    "FIRMS lists detections, not where a satellite looked and saw nothing, and has no cloud mask: a revealed tile "
    "with no detection may have been cloudy rather than free of fire. On the nominal schedule it may also be a half "
    "day on which the platform did not fly or its swath missed the box, so such a look is taken as unknown and "
    "teaches the model nothing. The looks are the nominal half-day slots of "
    "each VIIRS platform, taken from the platform and the calendar and not from the hidden detections; the real "
    "pass is up to about 90 minutes from a slot's time, sometimes comes twice, and its pixel size is not known in "
    "advance. A list of real overpass times would remove that approximation."
)
