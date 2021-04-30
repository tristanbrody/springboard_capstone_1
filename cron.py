# TODO because the OpenSecrets API has restrictive metering, and I have to filter most of the data myself, it'd make sense to just use a cron job to call their API once a day to get data for all 50 states for getLegislators. Then I can cache that data and save in my database

# the below is not working for me. It looks like Windows support for python-crontab is sketch. So other options -
# https://docs.prefect.io/core/getting_started/installation.html
# leaning toward this option directly available on Heroku - https://medium.com/analytics-vidhya/schedule-a-python-script-on-heroku-a978b2f91ca8

# from crontab import CronTab

# cron = CronTab(user="tristan")
# job = cron.new(command="python ./cronscript.py")
# job.minute.every(1)

# cron.write()