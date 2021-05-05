class User(db.Model, UserMixin):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True, unique=True, autoincrement=True)
    password = db.Column(db.String(200), nullable=False)
    email = db.Column(db.String(50), nullable=False, unique=True)
    first_name = db.Column(db.String(30), nullable=False)
    last_name = db.Column(db.String(30), nullable=False)


class UserRepresentative(db.Model):
    """Join table to store representatives a user is 'following'"""

    __tablename__ = "user_representatives"
    id = db.Column(db.Integer, unique=True)
    representative_id = db.Column(
        db.Integer,
        db.ForeignKey("representatives.id"),
        nullable=False,
        primary_key=True,
    )
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False, primary_key=True
    )


class Representative(db.Model):
    """Store some basic information from external APIs about a given representative a user is following"""

    __tablename__ = "representatives"
    id = db.Column(db.Integer, primary_key=True, unique=True)
    name = db.Column(db.String(100), nullable=False)
    state = db.Column(db.String(2), nullable=False)
    followed_by_users = db.relationship("User", secondary="user_representatives")