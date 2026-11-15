"""A prospective test: predictions of the sharp satellites sealed before their rows exist, scored when they do.

See docs/live.md. The sealing path reads MODIS near real time rows only; the scorer reads the VIIRS rows of a pass
after its prediction is sealed and scores it with `backend.eval.blind_test` unchanged.
"""
