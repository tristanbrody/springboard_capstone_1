import os
from test_parent_class import ParentTestCase
from unittest import TestCase
from sqlalchemy import exc

os.environ["DATABASE_URL"] = "postgresql:///capstone_test"

from app import (
    app,
    get_followed_representatives,
    get_search_history,
    call_open_fec,
    call_open_secrets,
    call_pro_publica,
    call_google_civic,
    OPENFEC_KEY,
    OPEN_SECRETS_KEY,
    PRO_PUBLICA_KEY,
    GOOGLE_CIVIC_INFORMATION_KEY,
)

import pdb

from models import db, User, Representative, UserRepresentative, AddressSearch

example_addresses = {
    "california_6": "5320 Ygnacio Dr Sacramento, California",
    "california_11": "141 Roslyn Drive, Concord CA 94518",
}


class HelperFunctionsTestCase(ParentTestCase, TestCase):
    """Tests for functions called from view functions"""

    def setUp(self):
        super(HelperFunctionsTestCase, self).setUp()

    def tearDown(self):
        resp = super().tearDown()
        db.session.rollback()
        return resp

    def testGetFollowedRepresentatives(self):
        """Should return a list of dictionaries with representatives user currently follows"""

        all_follow_records = UserRepresentative.query.filter_by(
            user_id=self.testuser.id
        ).all()

        result = get_followed_representatives(self.testuser.id, all_follow_records)

        for rec in result:
            self.assertIn("name", rec)
            self.assertIn("state", rec)
            self.assertIn("representative_id", rec)

    def testGetSearchHistory(self):
        """Should return a list of objects with search history from DB"""

        all_search_history = AddressSearch.query.filter_by(user=self.testuser.id).all()

        result = get_search_history(self.testuser.id, all_search_history)

        for rec in result:
            self.assertIn("search", rec)
            self.assertIn("date", rec)

    def testCallOpenFec(self):
        """Make sure we're getting valid response back from Open FEC API"""
        response = call_open_fec(
            "candidates", {"api_key": OPENFEC_KEY, "q": "Nancy Pelosi"}
        )

        self.assertEqual(200, response.status_code)
        self.assertIsNotNone(response.json()["results"])

    def testCallOpenSecrets(self):
        """Make sure we're getting valid response back from Open Secrets API"""

        response = call_open_secrets("getLegislators", "NY")

        self.assertGreaterEqual(len(response["response"]["legislator"]), 1)

    def testCallProPublica(self):
        """Make sure we're getting valid response back from Pro Publica API"""
        response = call_pro_publica("2016/candidates/H8IN07184")

        self.assertEqual(200, response.status_code)
        self.assertGreaterEqual(len(response.json()["results"]), 1)

    def testCallGoogleCivic(self):
        """Make sure we're getting valid response back from Google Civic API"""
        response = call_google_civic(
            "representatives", example_addresses["california_6"]
        )

        self.assertEqual(200, response.status_code)
