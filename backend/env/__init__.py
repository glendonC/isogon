"""The "next look" environment (CONTRACT amendment 10): where should the sharper instrument be consulted next?

An episode is one real run of overpasses over a region. The agent always has the MODIS detections; VIIRS is hidden.
At each VIIRS overpass it may spend one unit of a fixed budget to reveal the VIIRS detections inside one tile. The
reward is the gain in the blind-test score of the reconstruction against all the real VIIRS detections of the
episode. Rewards are never computed from simulated truth; the only simulated episodes are in the unit tests and are
named as such.

Known limit, stated wherever results are shown: FIRMS lists detections, not where a satellite looked and saw
nothing. Pass coverage of the tiles is assumed from orbit geometry (a pass that flagged anything in the wider
context box is taken to have covered every tile), and cloud is unknown.
"""

KNOWN_LIMITS: str = (
    "FIRMS lists detections, not where a satellite looked and saw nothing. Every tile is assumed covered by a pass "
    "that flagged anything in the wider context box, and cloud is unknown, so a revealed tile with no detection may "
    "have been cloudy rather than free of fire."
)
