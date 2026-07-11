import os
import sys

import pytest

# Route the app at a throwaway database BEFORE backend modules are imported.
_TEST_DB = os.path.join(os.path.dirname(__file__), "test_priceiq.db")
os.environ["PRICEIQ_DB"] = _TEST_DB

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import data  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def seeded_db():
    if os.path.exists(_TEST_DB):
        os.remove(_TEST_DB)
    data.init_db()
    data.seed_data()
    yield
    if os.path.exists(_TEST_DB):
        os.remove(_TEST_DB)
