import os
import sys
from unittest import TestCase
from sqlalchemy import exc

os.environ["DATABASE_URL"] = "postgresql:///capstone_test"
from app import app, get_followed_representatives


from models import db, User, Representative, UserRepresentative, AddressSearch


class ParentTestCase(TestCase):
    def setUp(self):
        """Parent class for test classes to derive"""
        db.drop_all()
        db.create_all()
        self.client = app.test_client()

        self.testuser = User.register(
            password="testuser",
            email="atest@test.com",
            first_name="Alice",
            last_name="Caroll",
        )
        db.session.add(self.testuser)
        db.session.commit()

        test_legislator = Representative(name="Bob Dole", state="KS")
        test_legislator2 = Representative(name="Barack Obama", state="IL")
        test_legislator3 = Representative(name="Elizabeth Warren", state="MA")
        db.session.add_all([test_legislator, test_legislator2, test_legislator3])
        db.session.commit()

        test_follow = UserRepresentative(representative_id=1, user_id=self.testuser.id)
        test_follow2 = UserRepresentative(representative_id=2, user_id=self.testuser.id)
        test_search = AddressSearch(
            search="10 main street fremont ca 98765", user=self.testuser.id
        )
        test_search2 = AddressSearch(
            search="10 A street benicia ca 98765", user=self.testuser.id
        )

        db.session.add_all([test_follow, test_follow2, test_search, test_search2])
        db.session.commit()
