"""Export one real Isogon run as a scene folder for OpenSpace (the openspace lane).

The exporter reads the backend's routes over HTTP and the NASA CMR pass files through the data lane's reader
(``backend.firms.cmr_passes``). Nothing in the backend or the page imports this package: deleting
``backend/openspace/`` and the top-level ``openspace/`` folder leaves the project as it was
(``backend/tests/test_openspace_modular.py`` checks that by import).
"""
