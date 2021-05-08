from dotenv import load_dotenv

load_dotenv()
import os
import re
from flask import (
    Flask,
    request,
    redirect,
    render_template,
    url_for,
    flash,
    jsonify,
    session,
)
from flask_debugtoolbar import DebugToolbarExtension
from sqlalchemy import desc
from wtforms_alchemy import ModelForm
from forms import AddressForm, LoginForm, AddUserForm, ChangePasswordForm, STATE_TUPLES
import requests

import us

# us package helps with state abbreviations and other fun stuff https://github.com/unitedstates/python-us

import pdb
import json
from models import (
    User,
    AddressSearch,
    Representative,
    UserRepresentative,
    db,
    connect_db,
)

import datetime

today = datetime.datetime.now()

# Thursday:

# TODO add to profile page - clicking on previous searches should open a new tab with the results. Clicking on legislator should open a new tab to a page with just their info

# TODO change functions that parse API data to only look at & rename the specific fields that are interesting to display

# TODO add account settings page for logged-in user. Should show ability to update password or delete account

# TODO refactor as much as possible

# TODO add basic exception handling for API responses

# Friday -

# TODO add tests
# TODO deploy to Herokuapp

# Saturday morning -

# TODO complete markdown file to include in GitHub repo


from flask_login import (
    LoginManager,
    UserMixin,
    login_user,
    current_user,
    login_required,
    logout_user,
)

login_manager = LoginManager()

app = Flask(__name__)

login_manager.init_app(app)
login_manager.login_view = "login"

app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get(
    "DATABASE_URL", "SQLALCHEMY_DATABASE_URI"
)
if app.config["SQLALCHEMY_DATABASE_URI"].startswith("postgres://"):
    app.config["SQLALCHEMY_DATABASE_URI"] = app.config[
        "SQLALCHEMY_DATABASE_URI"
    ].replace("postgres://", "postgresql://", 1)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SQLALCHEMY_ECHO"] = False

OPENFEC_ROOT = "https://api.open.fec.gov/v1"
OPENFEC_KEY = os.environ.get("OPENFEC_KEY")

GOOGLE_CIVIC_INFORMATION_ROOT = "https://www.googleapis.com/civicinfo/v2"
GOOGLE_CIVIC_INFORMATION_KEY = os.environ.get("GOOGLE_CIVIC_INFORMATION_KEY")
GOOGLE_CIVIC_DESIRED_KEYS = ["congressional_district", "county", "school_district"]
GOOGLE_CIVIC_DESIRED_OFFICES = [
    "Senator",
    "Governor",
    "Secretary of State",
    "Attorney General",
]

OPEN_SECRETS_ROOT = "http://www.opensecrets.org/api"
OPEN_SECRETS_KEY = os.environ.get("OPEN_SECRETS_KEY")

PRO_PUBLICA_ROOT = "https://api.propublica.org/campaign-finance/v1"
PRO_PUBLICA_KEY = os.environ.get("PRO_PUBLICA_KEY")

# store regex we'll need here, in case it needs to be duplicated
regex_dict = {
    "congressional_district": "cd:(\d+$)",
    "county": "county:(\w*)/?:?$",
    "school_district": "school_district:(.*)",
}


connect_db(app)

# flask-login requirements


@login_manager.user_loader
def load_user(userid):
    user_id = int(userid)
    return User.query.get(user_id)


# routes for UI


@app.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        flash("You're already logged in")
        return redirect("/search")
    form = LoginForm()
    if form.validate_on_submit():
        user = User.authenticate(form.username.data, form.password.data)
        if not user:
            flash("Incorrect username or password")
            return redirect(f"/login")
        login_user(user)
        flash(f"Welcome back, {user.first_name}")
        return redirect(url_for("search"))
    return render_template("login.html", form=form)


@app.route("/logout")
@login_required
def logout():
    logout_user()
    flash("You've been logged out")
    return redirect(url_for("search"))


@app.route("/register", methods=["GET", "POST"])
def register():
    if current_user.is_authenticated:
        flash("You're already logged in")
        return redirect(url_for("search"))
    form = AddUserForm()
    if form.validate_on_submit():
        user = User.query.filter_by(email=form.email.data).first()
        if user:
            flash("A user with that email address already exists", category="error")
            return redirect("/register")
        password = form.password.data
        email = form.email.data
        first_name = form.first_name.data
        last_name = form.last_name.data
        new_user = User.register(
            password=password,
            email=email,
            first_name=first_name,
            last_name=last_name,
        )
        db.session.add(new_user)
        db.session.commit()
        login_user(new_user)
        flash(f"You've successfully registered!")
        return redirect(url_for("search"))
    return render_template("sign_up.html", form=form)


@app.route("/profile")
@login_required
def profile():
    """Display account-specific info for logged-in user"""

    # want to get search history and followed legislators from DB
    followed = get_followed_representatives(
        current_user.id,
        UserRepresentative.query.filter_by(user_id=current_user.id).all(),
    )
    searches = get_search_history(
        current_user.id, AddressSearch.query.filter_by(user=current_user.id).all()
    )

    return render_template("profile.html", followed=followed, searches=searches)


@app.route("/")
def root():
    return redirect(url_for("search"))


@app.route("/search")
def search():
    """Search for addresses"""

    form = AddressForm()
    entries = []
    for index, tuple in enumerate(STATE_TUPLES):
        if tuple not in [
            ("Philippine Islands", "PI"),
            ("Orleans", "OL"),
            ("Dakota", "DK"),
        ]:
            entries.append(tuple)

    return render_template("search.html", form=form, entries=entries)


@app.route("/account", methods=["GET", "POST"])
def account_settings():
    """Allows for basic changes to account settings"""
    form = ChangePasswordForm()

    if form.validate_on_submit():
        change_password_attempt = User.change_password(
            id=current_user.id,
            current_password=form.current_password.data,
            new_password=form.new_password.data,
        )
        if change_password_attempt == current_user:
            db.session.commit()
            flash("Your password has been updated")
        else:
            flash("Current password is incorrect")
    return render_template("account.html", form=form)


# @app.route("/users/delete", methods=["POST"])
# @login_required
# def delete_user():
#     """Delete user."""
#     user = current_user
#     logout_user()
#     db.session.delete(user)
#     db.session.commit()
#     flash("Your account has successfully been deleted")

#     return redirect("/register")


@app.route("/following")
def check_for_follows():
    """After a logged-in user conducts a search, check if any of the results returned are already followed by them"""
    if current_user.is_authenticated:
        response = get_followed_representatives(
            current_user.id,
            UserRepresentative.query.filter_by(user_id=current_user.id).all(),
        )
        return {"following": response}
    return {"following": "not logged in"}


@app.route("/newuser", methods=["POST"])
def create_new_user():
    """Create new user in DB based on form data sent from JS"""
    if current_user.is_authenticated:
        flash("You're already logged in")
        return redirect(url_for("search"))
    email = request.form.get("email")
    password = request.form.get("password")
    first_name = request.form.get("first_name")
    last_name = request.form.get("last_name")
    new_user = User.register(
        password=password,
        email=email,
        first_name=first_name,
        last_name=last_name,
    )
    db.session.add(new_user)
    db.session.commit()
    login_user(new_user)
    flash("Your account has successfully been created")
    return redirect(url_for("search"))


@app.route("/update-search-history", methods=["POST"])
def update_search_history():
    """Called from JS to update search history for a logged-in user"""
    json_data = json.loads(request.data)
    address = f"{json_data['street']} {json_data['city']} {json_data['state']} {json_data['zip_code']}"
    new_search_record = AddressSearch(user=current_user.id, search=address)
    db.session.add(new_search_record)
    db.session.commit()
    return {"response": {"status": 200}}


@app.route("/userstate")
def get_user_state():
    """Endpoint for JS to determine if user is currently logged in"""
    return {"response": {"logged-in": str(current_user.is_authenticated)}}


@app.route("/follow-legislator", methods=["POST"])
def follow_legislator():
    """Endpoint called to add a new 'user_legislator' follow relationship"""
    json_data = json.loads(request.data)
    name = json_data["name"]
    state = json_data["state"]
    # check if legislator with this name and state combo is already in the DB
    new_legislator = Representative.query.filter(
        Representative.state == state, Representative.name == name
    ).first()
    if new_legislator == None:
        new_legislator = Representative(name=name, state=state)
        db.session.add(new_legislator)
        db.session.commit()
        new_legislator = Representative.query.order_by(-Representative.id).first()
    new_follow_record = UserRepresentative(
        representative_id=new_legislator.id, user_id=current_user.id
    )
    db.session.add(new_follow_record)
    db.session.commit()
    return {"response": "added"}


@app.route("/unfollow-legislator", methods=["POST"])
def unfollow_legislator():
    json_data = json.loads(request.data)
    name = json_data["name"]
    state = json_data["state"]
    rep = Representative.query.filter(
        Representative.state == state, Representative.name == name
    ).first()
    follow_record = UserRepresentative.query.filter(
        UserRepresentative.user_id == current_user.id,
        UserRepresentative.representative_id == rep.id,
    ).first()
    db.session.delete(rep)
    db.session.delete(follow_record)
    db.session.commit()
    return {"response": "deleted"}


# routes for communication with external API. All the endpoints starting with api/ will only be called from JS


@app.route("/api/legislator/search", methods=["POST"])
def legislator_search():
    """send API request to OpenFEC to get unique FEC id for a specific candidate selected by user on FE"""

    # this request doesn't have CSRF token

    json_data = json.loads(request.data)
    legislator = json_data["legislator"]
    state = json_data["state"]

    response = call_open_fec("candidates", {"api_key": OPENFEC_KEY, "q": legislator})

    return response.json()


@app.route("/api/legislators/search", methods=["POST"])
def legislators_search():
    """based on congressional district sent from client, send API request to OpenSecrets to get all current legislators for district"""

    # this request doesn't have CSRF token

    json_data = json.loads(request.data)
    state = json_data["state"].upper()

    return call_open_secrets("getLegislators", state)


@app.route("/api/legislator/financial", methods=["POST"])
def financial_search():
    """based on user selecting a candidate on FE, send API request(s) to ProPublica to get financial data"""

    json_data = json.loads(request.data)
    cycle = json_data["cycle"]
    candidate_id = json_data["candidate_id"]
    if int(cycle) > today.year:
        cycle = int(cycle) - 2

    response = call_pro_publica(f"{cycle}/candidates/{candidate_id}")
    # if candidate not found from ProPublica, try searching OpenFEC's API
    if response.json()["status"] == "ERROR":
        response = call_open_fec(
            f"candidate/{candidate_id}/history", {"api_key": OPENFEC_KEY}
        )
        new_res = {"results": []}
        for val in response.json()["results"]:
            if val["two_year_period"] == cycle:
                new_res["results"].append(val)
        return new_res
    return response.json()


@app.route("/api/legislator/expenditures", methods=["POST"])
def expenditure_search():
    """get data from OpenFEC API for a specific candidate's independent expenditures"""

    json_data = json.loads(request.data)
    candidate_id = json_data["candidate_id"]
    response = call_open_fec(
        f"schedules/schedule_e/by_candidate",
        {"api_key": OPENFEC_KEY, "candidate_id": candidate_id},
    )
    return response.json()


@app.route("/api/address/search", methods=["POST"])
def address_search():
    """based on address sent from client-side form, send API request to Google Civic Info to get local legislative data"""
    if request.method == "GET":
        return redirect(url_for("search"))

    json_data = json.loads(request.data)
    form = AddressForm(obj=json_data)
    if form.validate_on_submit():
        # data posted from form is valid - make API request
        address = normalize_address(
            form.street.data,
            form.city.data,
            form.state.data.upper(),
            form.zip_code.data,
        )
        response = call_google_civic("representatives", address)

    # we'll use address_metadata object and legislators list to store data parsed from response
    # the 'divisions' object returned from Google Civic API contains a key that should look something like 'ocd-division/country:us/state:ca/cd:6'. To get the congressional district, we'll get the end of this key name. We'll also pull from other keys to get the county and school district
    address_metadata = get_keys_from_JSON(
        response.json(), "divisions", GOOGLE_CIVIC_DESIRED_KEYS
    )
    legislators = []

    # retrieve data on a few key legislative positions returned by Google's API
    for i, (office, official) in enumerate(
        zip(response.json()["offices"], response.json()["officials"])
    ):
        if any(position in office["name"] for position in GOOGLE_CIVIC_DESIRED_OFFICES):
            for val in office["officialIndices"]:
                legislators.append(
                    {
                        "office": f"{office['name']}",
                        "data": response.json()["officials"][val],
                    }
                )

    return {
        "address_metadata": address_metadata,
        "address": {"fullAddress": address, "state": form.state.data},
        "legislators": legislators,
    }


def normalize_address(street, city, state, zip_code):
    # TODO add more logic to this function
    """Accepts and formats address data from HTML form"""
    return f"{street}, {city} {state} {zip_code}"


def get_followed_representatives(user_id, all_follow_records):
    """Returns a list of objects with name, state and representative id of each followed representative for logged-in user"""
    if all_follow_records is not None:
        following = []
        for record in all_follow_records:
            following.append(Representative.query.get(record.representative_id))
        response = []
        for rep in following:
            response.append(
                {
                    "name": rep.name,
                    "state": rep.state.upper(),
                    "representative_id": record.representative_id,
                }
            )
        return response
    return None


def get_search_history(user_id, all_search_history):
    """Returns a list of objects with search history from DB"""
    searches = [({"search": s.search, "date": s.timestamp}) for s in all_search_history]
    return searches if len(searches) > 0 else None


def call_open_fec(endpoint, params):
    return requests.get(
        f"{OPENFEC_ROOT}/{endpoint}",
        params=params,
    )


def call_open_secrets(method, state=None):
    """Make call to Open Secrets API with arguments provided"""
    response = requests.get(
        f"{OPEN_SECRETS_ROOT}/",
        params={
            "method": method,
            "apikey": OPEN_SECRETS_KEY,
            "id": state,
            "output": "json",
        },
    )
    return response.json()


def call_google_civic(endpoint, address):
    """Make call to Google Civic API with arguments provided"""
    return requests.get(
        f"{GOOGLE_CIVIC_INFORMATION_ROOT}/{endpoint}",
        params={
            "key": GOOGLE_CIVIC_INFORMATION_KEY,
            "address": address,
        },
    )


def call_pro_publica(endpoint):
    return requests.get(
        f"{PRO_PUBLICA_ROOT}/{endpoint}.json",
        headers={"X-API-Key": PRO_PUBLICA_KEY},
    )


def get_keys_from_JSON(JSON, object, desired_keys):
    """Convert json data into a list of just the keys from the specified object - object arg should be a string"""
    key_list = list(JSON[object].keys())
    new_obj = {}
    for entry in desired_keys:
        for key in key_list:
            if new_obj.get(entry, None) == None:
                search = re.search(regex_dict[entry], key)
            if search is not None:
                result = get_data_from_regex_match(search, 1)
                new_obj[entry] = result
    return new_obj


def get_data_from_regex_match(regex_match, group):
    """Given a regex match, return the specified group"""
    return regex_match.group(group) if regex_match is not None else None