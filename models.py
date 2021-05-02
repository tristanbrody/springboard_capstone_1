from flask import Flask
from flask_login.mixins import UserMixin
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy_json import mutable_json_type
from sqlalchemy.dialects.postgresql import JSONB
from flask_bcrypt import Bcrypt

bcrypt = Bcrypt()
db = SQLAlchemy()


def connect_db(app):
    db.app = app
    db.init_app(app)
    db.create_all()


class User(db.Model, UserMixin):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True, unique=True, autoincrement=True)
    password = db.Column(db.String(200), nullable=False)
    email = db.Column(db.String(50), nullable=False, unique=True)
    first_name = db.Column(db.String(30), nullable=False)
    last_name = db.Column(db.String(30), nullable=False)
    is_admin = db.Column(db.Boolean, default=False)
    last_searched_congressional_district = db.Column(db.Integer)
    last_searched_state = db.Column(db.String(2))

    @classmethod
    def register(cls, password, email, first_name, last_name):
        hashed_password = bcrypt.generate_password_hash(password)
        hashed_password_utf8 = hashed_password.decode("utf8")
        return cls(
            password=hashed_password_utf8,
            email=email,
            first_name=first_name,
            last_name=last_name,
        )

    @classmethod
    def authenticate(cls, email, password):
        user = User.query.filter_by(email=email).first()
        if user and bcrypt.check_password_hash(user.password, password):
            return user
        return False


class AddressSearch(db.Model):
    """Stores JSON search results from external APIs based on US address"""

    __tablename__ = "address_searches"

    id = db.Column(db.Integer, primary_key=True, unique=True)
    google_data = db.Column(mutable_json_type(JSONB, nested=True))
    open_secrets_data = db.Column(mutable_json_type(JSONB, nested=True))
    search = db.Column(db.String(200), nullable=False)
    timestamp = db.Column(db.Date, default=db.func.current_timestamp())
    user = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)


# TODO keep working on the models below -
class UserRepresentative(db.Model):
    """Join table to store representatives a user is 'following'"""

    id = db.Column(db.Integer, primary_key=True, unique=True)


class Representative(db.Model):
    """Store some basic information from external APIs about a given representative a user is following"""

    id = db.Column(db.Integer, primary_key=True, unique=True)
    # google_civic_information_id = db.Column()
    # open_secrets_id = db.Column()
    # open_fec_id = db.Column()
    name = db.Column(db.String(100), nullable=False)


# TODO look up example of saving search history using SQLAlchemy

# TODO look up saving JSON data using SQLAlchemy