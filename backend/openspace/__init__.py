"""Export one real Isogon run as a scene folder for OpenSpace.

The exporter reads the backend's routes over HTTP and the NASA CMR pass files through their reader
(``backend.firms.cmr_passes``). Nothing in the backend or the page imports this package: deleting
``backend/openspace/`` and the top-level ``openspace/`` folder leaves the rest of the project working
(``backend/tests/test_openspace_modular.py`` checks that by import).
"""
