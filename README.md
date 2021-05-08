# Fun with the FEC
### Springboard Capstone #1

This mini-project is my first 'Capstone' for [Springboard's](https://www.springboard.com) software engineering bootcamp.

The application allows you to search an address in the United States to see a list of local legislators for your given state and congressional district. For each legislator, you
see relevant public information about campaign finances and expenditures for their most recent election cycle(s).  
  
Additionally, users who register for an account can 'follow' specific legislators and save their search history.

### Data Sources

- - -

All data presented in the application is pulled from free APIs that provide access to public information:
> [OpenFEC API](https://api.open.fec.gov/developers/)  
>
> [ProPublica API](https://propublica.github.io/campaign-finance-api-docs/#campaign-finance-api-documentation) 
>
> [Google Civic Information API](https://developers.google.com/civic-information)  
>
> [OpenSecrets API](https://www.opensecrets.org/open-data/api-documentation)  

### Technologies used

* Flask
* Python
* SQLAlchemy
* JavaScript
* Deployed on Heroku [here)[https://fun-with-the-fec.herokuapp.com/search] using gunicorn
