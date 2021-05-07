from flask_wtf import FlaskForm
from wtforms import (
    StringField,
    FloatField,
    IntegerField,
    BooleanField,
    PasswordField,
    TextAreaField,
    SelectField,
)
from wtforms.fields.html5 import EmailField
from wtforms.validators import (
    InputRequired,
    Regexp,
    URL,
    NumberRange,
    Optional,
    Length,
    DataRequired,
)
import us

# create a list of tuples in format ('California', 'CA') to use for select field
STATE_TUPLES = []
for key, value in us.states.mapping("abbr", "name").items():
    STATE_TUPLES.append((value, key))


class AddressForm(FlaskForm):
    """Form for looking up a US address"""

    street = StringField("Address", validators=[InputRequired()])
    city = StringField("City", validators=[InputRequired()])
    state = StringField("State", validators=[InputRequired()])
    zip_code = IntegerField("Zip Code", validators=[InputRequired()])
    # TODO figure out using regex validator to check '\d{5}'. Not sure why Regexp(\d{5}) doesn't work


class AddUserForm(FlaskForm):
    """Form for adding a new user"""

    email = EmailField("Email address", validators=[InputRequired()])
    password = PasswordField("Password", validators=[InputRequired()])
    first_name = StringField("First name", validators=[InputRequired()])
    last_name = StringField("Last name", validators=[InputRequired()])


class LoginForm(FlaskForm):
    username = StringField("Username", validators=[InputRequired()])
    password = PasswordField("Password", validators=[InputRequired()])


class ChangePasswordForm(FlaskForm):

    current_password = PasswordField("Current password", validators=[DataRequired()])
    new_password = PasswordField("New password", validators=[Length(min=6)])
    confirm_new_password = PasswordField(
        "Confirm new password", validators=[Length(min=6)]
    )

    # extend validate function to cross-validate 'confirm password' field
    def validate(self):
        if not super().validate():
            return False
        result = True
        seen = set()
        for field in [self.new_password, self.confirm_new_password]:
            if self.new_password.data != self.confirm_new_password.data:
                field.errors.append("New password and confirmation do not match.")
                result = False
            elif self.new_password.data == self.current_password.data:
                field.errors.append(
                    "New password must be different from current password"
                )
                result = False
            else:
                seen.add(field.data)
        return result