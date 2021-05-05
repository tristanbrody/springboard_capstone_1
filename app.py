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
from forms import AddressForm, LoginForm, AddUserForm, STATE_TUPLES
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

# TODO remove pdb when done with project

# - refactor event listener for card tab

# TODO change functions that parse API data to only look at the specific fields that are actually interesting to display

# TODO create endpoint that returns a CSRF token for use in JS forms


# priority -

# TODO add a profile page for logged-in user. Should show ppl the user follows & search history

# TODO add endpoints/logic/FE for searching for committees related to a given candidate

# TODO add account settings page for logged-in user. Should show ability to update password or delete account

# TODO start refactoring

# TODO add tests

# TODO add error handling for API responses

# TODO add loading bar

# TODO add endpoints/logic/FE for searching https://api.open.fec.gov/v1/schedules/schedule_e/by_candidate - this shows expenditures for ads for or against a candidate

# TODO add ability to search directly for legislator by name


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

app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get("SQLALCHEMY_DATABASE_URI")
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SQLALCHEMY_ECHO"] = False

OPENFEC_ROOT = "https://api.open.fec.gov/v1"
OPENFEC_KEY = os.environ.get("OPENFEC_KEY")

GOOGLE_CIVIC_INFORMATION_ROOT = "https://www.googleapis.com/civicinfo/v2"
GOOGLE_CIVIC_INFORMATION_KEY = os.environ.get("GOOGLE_CIVIC_INFORMATION_KEY")

OPEN_SECRETS_ROOT = "http://www.opensecrets.org/api"
OPEN_SECRETS_KEY = os.environ.get("OPEN_SECRETS_KEY")

PRO_PUBLICA_ROOT = "https://api.propublica.org/campaign-finance/v1"
PRO_PUBLICA_KEY = os.environ.get("PRO_PUBLICA_KEY")

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


# just setting some example addresses here along with the congressional district they map to. Can move this to a testing file later TODO when I write tests, move this to test file
example_addresses = {
    "california_6": "5320 Ygnacio Dr Sacramento, California",
    "california_11": "141 Roslyn Drive, Concord CA 94518",
}

# store regex we'll need here, in case it needs to be duplicated
regex_dict = {
    "congressional_district": "cd:(\d+$)",
    "county": "county:(\w*)/?:?$",
    "school_district": "school_district:(.*)",
}


@app.route("/")
def root():
    """Root page - just for testing API communication for now"""
    # TODO clear this view function up once I'm done testing

    # response = requests.get(
    #     f"{GOOGLE_CIVIC_INFORMATION_ROOT}/representatives",
    #     params={
    #         "key": GOOGLE_CIVIC_INFORMATION_KEY,
    #         "address": "141 Roslyn Dr Concord CA 94518",
    #     },
    # )
    # # we'll use address_metadata object to store data parsed from response
    # address_metadata = {}
    # # the 'divisions' object returned from Google Civic API contains a key that should look something like 'ocd-division/country:us/state:ca/cd:6'. To get the congressional district, we'll get the end of this key name. We'll also pull from other keys to get the county and school district

    # # convert json data into a list of just the keys from the divisions object
    # divisions_keys_string = list(response.json()["divisions"].keys())
    # for entry in ["congressional_district", "county", "school_district"]:
    #     for key in divisions_keys_string:
    #         # TODO is there a better way to get this than just looping through the list each time?
    #         if address_metadata.get(entry, None) == None:
    #             search = re.search(regex_dict[entry], key)
    #         if search is not None:
    #             result = get_data_from_regex_match(search, 1)
    #             address_metadata[entry] = result

    # return render_template("root.html", address_metadata=address_metadata)

    return redirect(url_for("search"))


@app.route("/search")
def search():
    """Search for addresses"""
    # TODO remove this later/move functionality as needed

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


@app.route("/following")
def check_for_follows():
    """After a logged-in user conducts a search, check if any of the results returned are already followed by them"""
    all_follow_records = UserRepresentative.query.filter_by(
        user_id=current_user.id
    ).all()
    if all_follow_records is not None:
        following = []
        for record in all_follow_records:
            following.append(Representative.query.get(record.representative_id))
        response = []
        for rep in following:
            response.append(
                {
                    "name": rep.name,
                    "state": rep.state,
                    "representative_id": record.representative_id,
                }
            )

    return {"following": response}


def get_data_from_regex_match(regex_match, group):
    """Given a regex match, return the specified group"""
    return regex_match.group(group) if regex_match is not None else None


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
    check = Representative.query.filter(
        Representative.state == state, Representative.name == name
    ).first()
    if check == None:
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
    return {"response": "user already follows this legislator"}


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

    response = requests.get(
        f"{OPENFEC_ROOT}/candidates",
        params={"api_key": OPENFEC_KEY, "q": legislator},
    )

    return response.json()


@app.route("/api/legislators/search", methods=["POST"])
def legislators_search():
    """based on congressional district sent from client, send API request to OpenSecrets to get all current legislators for district"""

    # this request doesn't have CSRF token

    json_data = json.loads(request.data)
    state = json_data["state"].upper()

    response = requests.get(
        f"{OPEN_SECRETS_ROOT}/",
        params={
            "method": "getLegislators",
            "apikey": OPEN_SECRETS_KEY,
            "id": state,
            "output": "json",
        },
    )
    return response.json()


@app.route("/api/legislator/financial", methods=["POST"])
def financial_search():
    """based on user selecting a candidate on FE, send API request(s) to ProPublica to get financial data"""

    json_data = json.loads(request.data)
    cycle = json_data["cycle"]
    candidate_id = json_data["candidate_id"]
    if int(cycle) > today.year:
        cycle = int(cycle) - 2
    response = requests.get(
        f"{PRO_PUBLICA_ROOT}/{cycle}/candidates/{candidate_id}.json",
        headers={"X-API-Key": PRO_PUBLICA_KEY},
    )
    # if candidate not found from ProPublica, try searching OpenFEC's API
    if response.json()["status"] == "ERROR":
        response = requests.get(
            f"{OPENFEC_ROOT}/candidate/{candidate_id}/history",
            params={"api_key": OPENFEC_KEY},
        )
        new_res = {"results": []}
        for val in response.json()["results"]:
            if val["two_year_period"] == cycle:
                new_res["results"].append(val)
        return new_res
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
        response = requests.get(
            f"{GOOGLE_CIVIC_INFORMATION_ROOT}/representatives",
            params={
                "key": GOOGLE_CIVIC_INFORMATION_KEY,
                "address": address,
            },
        )
        # we'll use address_metadata object and legislators list to store data parsed from response
    address_metadata = {}
    legislators = []
    # the 'divisions' object returned from Google Civic API contains a key that should look something like 'ocd-division/country:us/state:ca/cd:6'. To get the congressional district, we'll get the end of this key name. We'll also pull from other keys to get the county and school district

    # convert json data into a list of just the keys from the divisions object
    divisions_keys_string = list(response.json()["divisions"].keys())
    for entry in ["congressional_district", "county", "school_district"]:
        for key in divisions_keys_string:
            # TODO is there a better way to get this than just looping through the list each time?
            if address_metadata.get(entry, None) == None:
                search = re.search(regex_dict[entry], key)
            if search is not None:
                result = get_data_from_regex_match(search, 1)
                address_metadata[entry] = result

    # retrieve data on a few key legislative positions returned by Google's API
    positions = ["Senator", "Governor", "Secretary of State", "Attorney General"]
    for i, (office, official) in enumerate(
        zip(response.json()["offices"], response.json()["officials"])
    ):
        if any(position in office["name"] for position in positions):
            for val in office["officialIndices"]:
                legislators.append(
                    {
                        "office": f"{office['name']}",
                        "data": response.json()["officials"][val],
                    }
                )

    # TODO add separate endpoint for adding JSON API results to my DB
    # json_record = AddressSearch(
    #     data={
    #         "address_metadata": address_metadata,
    #         "address": {"fullAddress": address, "state": form.state.data},
    #     }
    # )
    # db.session.add(json_record)
    # db.session.commit()
    return {
        "address_metadata": address_metadata,
        "address": {"fullAddress": address, "state": form.state.data},
        "legislators": legislators,
    }


# potential API flows -

# TODO get these API flows to work (listed in order of priority)
# FLOW 1: basic search based on US address
# 1) user enters their address
# 2) API call to https://www.googleapis.com/civicinfo/v2/representatives maps address to congressional district
# info on /representatives endpoint from Google:
# A resource in this collection has three sections, described in detail below. The divisions section lists political geographic divisions, like a country, state, county, or legislative district. (Which divisions will be listed depends on the specific API request made.) The offices section lists political positions that are elected to represent the divisions in the first section. The officials section lists people presently serving in the offices listed.

# 3) search results displayed based on data from 2 - should show congressional district for address entered, and current legislators for that area in house and senate

# FLOW 2: click into a specific result from 1 and get financial info about candidate

# 1) user clicks on a specific candidate returned from flow 1
# 2) then, we have options in terms of how we'll get the data we want. To get basic info, we could use a combo of the getLegislators and candSummary endpoints from opensecrets (this would be kind of annoying because it'd first require looking up the result from flow 1.2 on getLegislators, then using the unique ID returned by opensecrets to pull from the candSummary endpoint)

# because of the API call restrictions on OpenSecrets, probably is better to use some combo of OpenFEC and ProPublica's APIs in order to get financial data. But on OpenSecrets, candContrib and candIndustry might be cool if I can work around the metering

# on OpenFEC, would first need to take the district/state/legislator name from 1.2 and search in candidates/search/ . If found, grab the unique FEC candidate id and use it to hit other OpenFEC endpoints.

# FLOW 3: add option to 'drill down' for more details on candidate's history

# 1) after 2.2, display another link to see details about candidate's history.
#
# 2) make call to /candidate/{candidate_id}/history/ endpoint on OpenFEC

# subcategory of flows based on filtering search results

# FLOW 4: FILTER FOR ELECTIONS based on congressional district returned from 1
# 1) use /elections/search/ endpoint on OpenFEC

# FLOW 5:


def normalize_address(street, city, state, zip_code):
    # TODO add more logic to this function
    """Accepts and formats address data from HTML form"""
    return f"{street}, {city} {state} {zip_code}"
