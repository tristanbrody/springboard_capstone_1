const addressForm = document.querySelector('#form-address-search');

addEventListener(document.querySelector('.overlay'), 'toggleOverlay', 'click');
addressForm.addEventListener('submit', submitAddressForm);

//determine if user is logged in based on response from our server
if (localStorage.getItem('logged-in') === (false || null)) {
	localStorage.setItem('logged-in', getCurrentUserState());
}

let checkLocalStorage = getMostRecentSearch();
if (checkLocalStorage !== null) {
	document.querySelector('#results-ul').innerHTML = checkLocalStorage;
	reAddEventListenersToArrowElements();
	reAddEventListenersToFollowLegislatorButtons();
}

async function submitAddressForm(e) {
	e.preventDefault();
	clearPreviousSearch();

	const data = new FormData(e.target);
	const formData = Object.fromEntries(data.entries());
	delete formData.crsf_token;

	//need to include csrf-token here so we can use WTForm validate_on_submit method (https://stackoverflow.com/questions/58369348/flask-csrf-and-fetch-api)
	// this API call will return metadata about address (including congressional district), the address searched, and key legislative positions relevant to that address
	const google_resp = await fetch('/api/address/search', {
		method: 'post',
		headers: { 'X-CSRF-TOKEN': e.target.csrf_token.value, 'Content-Type': 'application/json' },
		body: JSON.stringify(formData),
		credentials: 'same-origin'
	}).then(response => response.json());

	// this API call will return representative for state from address search
	const open_secrets_resp = await fetch('/api/legislators/search', {
		method: 'post',
		body: JSON.stringify({ state: google_resp['address']['state'] })
	}).then(response => response.json());
	//pass state from API call above to OpenSecrets API
	let outerUl = document.createElement('ul');
	let congressionalDistrict;
	for (const [key, value] of Object.entries(google_resp['address_metadata'])) {
		if (key === 'congressional_district') congressionalDistrict = value;
		let li = document.createElement('li');
		li.innerText = title(key) + ': ' + title(value);
		outerUl.append(li);
		document.querySelector('#results-ul').append(outerUl);
	}
	if (congressionalDistrict.length === 1) congressionalDistrict = '0' + congressionalDistrict;

	//TODO the OpenSecrets API only allows you to filter by state, so when showing results will need to filter based on the congressionalDistrict variable above returned from Google API
	for (let x = 0; x < open_secrets_resp.response.legislator.length; x++) {
		//destructure the 'attributes' object returned from Google's API
		let {
			firstlast: name,
			feccandid: FEC_Candidate_Id,
			party,
			office,
			phone,
			website
		} = open_secrets_resp.response.legislator[x]['@attributes'];
		const filteredResponse = { ...open_secrets_resp.response.legislator[x]['@attributes'] };
		//loop through response and delete the properties we don't need
		for (let key in filteredResponse) {
			if (['firstlast', 'feccandid', 'party', 'office', 'phone', 'website'].includes(key) === false) {
				delete filteredResponse[key];
			}
		}
		let h4 = document.createElement('h4');
		h4.innerText = `District Representative | ${name}`;

		// let ul = document.createElement('ul');
		// let div = document.createElement('div');
		if (office === `${google_resp['address']['state'].toUpperCase()}${congressionalDistrict}`) {
			let newElements = addSearchResultsToDOM(filteredResponse, name, google_resp['address']['state']);
			addFollowButtonToDOM(filteredResponse['firstlast'], h4);
			document.querySelector('#results-ul').append(h4);
			document.querySelector('#results-ul').append(newElements['i']);
			document.querySelector('#results-ul').append(newElements['cardDiv']);
		}
	}

	//also want to display legislator data from Google's API

	for (let legislator of google_resp['legislators']) {
		let h4 = document.createElement('h4');
		h4.innerText = `${legislator['office']} | ${legislator['data']['name']}`;
		const filteredResponse = { ...legislator['data'] };
		for (let key in filteredResponse) {
			if (key === 'address' || key === 'channels') {
				delete filteredResponse[key];
			}
		}
		let newElements = addSearchResultsToDOM(
			filteredResponse,
			legislator['data']['name'],
			google_resp['address']['state']
		);
		addFollowButtonToDOM(filteredResponse['name'], h4);
		document.querySelector('#results-ul').append(h4);
		document.querySelector('#results-ul').append(newElements['i']);
		document.querySelector('#results-ul').append(newElements['cardDiv']);
	}
	document.querySelector('#results-ul').prepend(`Results for ${google_resp['address']['fullAddress']}:`);
	cacheMostRecentSearch(document.querySelector('#results-ul').innerHTML);
	//TODO after everything here wraps, JS should handle posting the responses from Google and OpenSecrets, as well as the address searched, to an endpoint that will create an AddressSearch record to add to DB

	//TODO try adding recent search history to local storage. Could also potentially save the rendered HTML from the original search result
}

function title(phrase) {
	//remove underscores and capitalize results from API
	return phrase
		.split('_')
		.map(word => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

function clearPreviousSearch() {
	document.querySelector('#results-ul').innerHTML = '';
}

async function getLegislatorFECId(legislator, state) {
	//for a given candidate, look them up by name to get their unique FEC candidate id and most recent election cycle year
	const res = await fetch('/api/legislator/search', {
		method: 'post',
		body: JSON.stringify({ state, legislator })
	}).then(response => response.json());

	let FECId, cycle;
	try {
		FECId = res.results[0]['candidate_id'];
		//cycle will be last element in cycles array
		//TODO this could return a date in the future. Might want logic that looks at most recent election cycle that's already passed?
		cycle = res.results[0]['cycles'].pop();
	} catch {
		FECId = 'Not Found';
		cycle = 2020;
	}

	return { candidate_id: FECId, cycle };
}

async function getLegislatorFinancialData(candidate_id, cycle) {
	//provided a unique FEC candidate id, call our endpoint to look them up on ProPublica's API & get more financial data

	const res = await fetch('/api/legislator/financial', {
		method: 'post',
		body: JSON.stringify({ candidate_id, cycle })
	}).then(response => response.json());
	//parse res to get financial data
	let financialData = res.results;
	return financialData;
}

function toggleArrowElement(el) {
	//function called to toggle fontawesome classes on arrow icon
	el.classList.toggle('fa-angle-right');
	el.classList.toggle('fa-angle-down');
	return el;
}

//functions to handle parsing objects and adding data to DOM

function addFinancialDataForLegislatorToDOM(financialData, target) {
	let ul = document.createElement('ul');
	try {
		if (Object.keys(financialData[0]).length > 0) {
			console.dir(financialData);
			for (const [key, value] of Object.entries(financialData[0])) {
				let li = document.createElement('li');
				li.innerText = `${title(key)}: ${value}`;
				ul.append(li);
			}
		}
	} catch {
		let p = document.createElement('p');
		p.innerText = 'No financial data found for most recent election cycle';
		ul.append(p);
	}
	target.insertAdjacentElement('afterend', ul);
}

function addTopDataForLegislatorToDom(legislatorData, target) {
	//given an object with data about a legislator, and a target, add specific info from the data to DOM
	const cardDiv = document.createElement('div');
	cardDiv.classList.add('card', 'text-left', 'mt-2', 'mb-2');
	const nestedDiv = document.createElement('div');
	nestedDiv.classList.add('card-header');
	cardDiv.append(nestedDiv);
	const nestedUl = document.createElement('ul');
	nestedUl.classList.add('nav', 'nav-tabs', 'card-header-tabs');
	nestedDiv.append(nestedUl);
	for (let liText of ['Overview', 'Financial Data', 'Committees']) {
		const liNavItem = document.createElement('li');
		liNavItem.classList.add('nav-item');
		nestedUl.append(liNavItem);
		const anchor = document.createElement('a');
		anchor.classList.add('nav-link');
		anchor.innerText = liText;
		anchor.href = '#';
		anchor.addEventListener('click', e => false);
		if (liText === 'Overview') {
			anchor.classList.add('active');
		}
		liNavItem.append(anchor);
	}

	let moreData = document.createElement('li');
	moreData.innerText = 'Financial Data';
	moreData.style.cursor = 'pointer';
	let div = document.createElement('div');
	let ul = document.createElement('ul');
	for (const [key, value] of Object.entries(legislatorData['legislator'])) {
		let li = document.createElement('li');
		li.innerText = `${title(key)}: ${value}`;
		ul.append(li);
	}
	let i2 = document.createElement('i');
	i2.classList.add('fas');
	i2.classList.add('fa-angle-right');
	i2.classList.add('fa-sm');
	i2.dataset.legislator = legislatorData['legislator']['name'];
	i2.dataset.state = legislatorData['state'];
	i2.dataset.financial_section = 'True';
	ul.append(moreData);
	ul.append(i2);
	addEventListener(i2, 'appendLegislatorFinancialData', 'click');
	div.append(ul);
	target.insertAdjacentElement('afterend', ul);
	cacheMostRecentSearch(document.querySelector('#results-ul').innerHTML);
	cardDiv.append(div);
	target.append(cardDiv);
}

function addFollowButtonToDOM(legislatorData, target) {
	// given an object with data about a legislator added to the DOM from search results, create a button with event listener to 'follow' the legislator
	const btn = document.createElement('button');
	btn.classList.add('btn', 'btn-sm', 'btn-primary', 'ml-3', 'button--follow-legislator');
	btn.innerText = 'Follow Legislator';
	btn.dataset.candidate_id = legislatorData;
	addEventListener(btn, 'toggleOverlay', 'click');
	target.append(btn);
}

function cacheMostRecentSearch(search) {
	//save data for most recent search to local storage
	localStorage.setItem('mostRecentSearch', document.querySelector('#results-ul').innerHTML);
}

function getMostRecentSearch() {
	//get most recent search saved in local storage
	return localStorage.getItem('mostRecentSearch');
}

function addSearchResultsToDOM(response, name = 'not passed in', state = 'not passed in') {
	//function takes in object that only has specific properties we want to display for a given API response, and, optionally, separate variables for name and state of legislator
	const cardDiv = document.createElement('div');
	cardDiv.classList.add('card', 'text-left', 'mt-2', 'mb-2');
	const nestedDiv = document.createElement('div');
	nestedDiv.classList.add('card-header');
	cardDiv.append(nestedDiv);
	const nestedUl = document.createElement('ul');
	nestedUl.classList.add('nav', 'nav-tabs', 'card-header-tabs');
	nestedDiv.append(nestedUl);
	for (let liText of ['Overview', 'Financial Data', 'Committees']) {
		const liNavItem = document.createElement('li');
		liNavItem.classList.add('nav-item');
		nestedUl.append(liNavItem);
		const anchor = document.createElement('a');
		anchor.classList.add('nav-link');
		anchor.innerText = liText;
		anchor.href = '#';
		anchor.addEventListener('click', e => false);
		if (liText === 'Overview') {
			anchor.classList.add('active');
		}
		liNavItem.append(anchor);
	}

	let ul = document.createElement('ul');
	let div = document.createElement('div');
	div.classList.add('card-body');
	let moreData = document.createElement('li');
	moreData.innerText = 'Financial Data';
	moreData.style.cursor = 'pointer';
	for (const [key, value] of Object.entries(response)) {
		let li = document.createElement('li');
		li.innerText = `${title(key)}: ${value}`;
		ul.append(li);
	}

	let i = document.createElement('i');
	i.classList.add('fas');
	i.classList.add('fa-angle-down');
	let i2 = document.createElement('i');
	i2.classList.add('fas');
	i2.classList.add('fa-angle-right');
	i2.classList.add('fa-sm');
	i2.dataset.legislator = name;
	i2.dataset.state = state;
	i2.dataset.financial_section = 'True';

	ul.append(moreData);
	ul.append(i2);
	div.append(ul);
	cardDiv.append(div);
	i.dataset.legislator = `${name}-top`;
	localStorage.setItem(
		`${i.dataset.legislator}`,
		JSON.stringify({
			legislator: response,
			state: i2.dataset.state
		})
	);
	addEventListener(i, 'toggle-arrow-top', 'click');
	addEventListener(i2, 'appendLegislatorFinancialData', 'click');

	//return i and cardDiv to append to DOM
	return { cardDiv, i };
}

/* EVENT LISTENER FUNCTIONS */

function addEventListener(element, name, type) {
	//to help organize event listeners, declare all event listener functions in object here and pass parameters into this function to add event listener to a given element
	const eventListeners = {
		'toggle-arrow-top': function () {
			// 'top-level-arrow' on legislator data has been clicked. Check what class it currently contains to determine whether or not we need to remove data from the DOM or grab it from local storage and re-add
			toggleArrowElement(element);
			if (element.classList.contains('fa-angle-down')) {
				let localStorageData = JSON.parse(localStorage.getItem(element.dataset.legislator));
				addTopDataForLegislatorToDom(localStorageData, element);
			} else {
				element.nextSibling.innerText = '';
			}
		},
		appendLegislatorFinancialData: async function (e) {
			//called from event listener. Calls out to functions that make API calls to get a given legislator's unique id and financial data for their most recent election cycle
			toggleArrowElement(element);
			let legislator = e.target.dataset.legislator;
			let state = e.target.dataset.state;
			//clicked data attribute is set to True if user has already clicked on this - this is to prevent duplicate API calls
			if (e.target.dataset.clicked === 'true') {
				//retrieve data from local storage, since search for financial data was already completed
				//if arrow clicked has 'down' class list, data needs to be re-added to DOM
				if (e.target.classList.contains('fa-angle-down')) {
					const retrievedFinancialData = JSON.parse(
						window.localStorage.getItem(`${state}-${legislator}-financial`)
					);
					console.log(`${state}=${legislator}-financial`);
					addFinancialDataForLegislatorToDOM(retrievedFinancialData, e.target);
				}
				//otherwise data should be removed from DOM
				else {
					e.target.nextSibling.innerText = '';
				}
			} else {
				const legislatorData = await getLegislatorFECId(legislator, state);
				const financialData = await getLegislatorFinancialData(
					legislatorData['candidate_id'],
					legislatorData['cycle']
				);
				const financialDataObj = financialData[0];
				//loop through response and delete the properties we don't need
				for (let key in financialDataObj) {
					if (
						[
							'begin_cash',
							'first_file_date',
							'candidate_loans',
							'data_coverage_from',
							'data_coverage_to',
							'party_full',
							'debts_owed',
							'end_cash',
							'fec_uri',
							'independent_expenditures',
							'other_cycles',
							'total_contributions',
							'total_disbursements',
							'total_from_individuals',
							'total_from_pacs',
							'total_receipts',
							'url'
						].includes(key) === false
					) {
						delete financialDataObj[key];
					}
				}
				let target = document.querySelector(`[data-legislator=${CSS.escape(legislator)}]`);
				addFinancialDataForLegislatorToDOM([financialDataObj], target);
				e.target.dataset.clicked = 'true';
				e.target.legislator = legislator;

				//add financial data to local storage so it can be hidden/re-displayed
				//local storage will use a key of state-legislator-financial
				localStorage.setItem(`${state}-${legislator}-financial`, JSON.stringify(financialData));
			}
			cacheMostRecentSearch(document.querySelector('#results-ul').innerHTML);
		},
		toggleOverlay: function (e) {
			if (
				e.target.parentElement.classList.contains('form--inside-overlay') ||
				e.target.classList.contains('form--inside-overlay') ||
				e.target.classList.contains('overlay-child-container')
			) {
				return false;
			}
			document.querySelector('.overlay').classList.toggle('hidden');
		}
	};
	element.addEventListener(type, eventListeners[name]);
}

function reAddEventListenersToArrowElements() {
	//if page is refreshed, re-add relevant event listeners to search results
	const allIElements = document.querySelectorAll('i');
	for (let el of Array.from(allIElements)) {
		if (el.dataset.financial_section === 'True') {
			addEventListener(el, 'appendLegislatorFinancialData', 'click');
		} else {
			addEventListener(el, 'toggle-arrow-top', 'click');
		}
	}
}

function reAddEventListenersToFollowLegislatorButtons() {
	//if page is refreshed, re-add event listener to 'Follow Legislator' button in search results
	for (let el of Array.from(document.querySelectorAll('button.button--follow-legislator'))) {
		addEventListener(el, 'toggleOverlay', 'click');
	}
}

async function getCurrentUserState() {
	//call our endpoint to get server-side data re if user is currently logged in - returns boolean
	return await fetch('/userstate', {
		method: 'get'
	});
}

{
	/* <div class="card text-center">
  <div class="card-header">
    <ul class="nav nav-tabs card-header-tabs">
      <li class="nav-item">
        <a class="nav-link active" href="#">Active</a>
      </li>
      <li class="nav-item">
        <a class="nav-link" href="#">Link</a>
      </li>
      <li class="nav-item">
        <a class="nav-link disabled" href="#">Disabled</a>
      </li>
    </ul>
  </div>
  <div class="card-body">
    <h5 class="card-title">Special title treatment</h5>
    <p class="card-text">With supporting text below as a natural lead-in to additional content.</p>
    <a href="#" class="btn btn-primary">Go somewhere</a>
  </div>
</div> */
}

// const cardDiv = document.createElement('div');
// cardDiv.classList.add('card', 'text-center');
// cardDiv.innerHTML += `<div class="card-header">
// <ul class="nav nav-tabs card-header-tabs">
//   <li class="nav-item">
// 	<a class="nav-link active" href="#">Overview</a>
//   </li>
//   <li class="nav-item">
// 	<a class="nav-link" href="#">Financial Data</a>
//   </li>
//   <li class="nav-item">
// 	<a class="nav-link" href="#">Committees</a>
//   </li>
// </ul>`;

// addEventListener('cardDiv', 'handleCardDivClick', 'click');

// const nestedDiv = document.createElement('div');
// nestedDiv.classList.add('card-header');
// cardDiv.append(nestedDiv);
// const nestedUl = document.createElement('ul');
// nestedUl.classList.add('nav', 'nav-tabs', 'card-header-tabs');
// nestedDiv.append(nestedUl);
// for (let liText of ['Overview', 'Financial Data', 'Overview']) {
// 	const liNavItem = document.createElement('li');
// 	li.classList.add('nav-item');
// 	const anchor = document.createElement('a');
// 	anchor.classList.add('nav-link');
// 	anchor.innerText = liText;
// 	if (liText === 'Overview') {
// 		anchor.classList.add('active');
// 	}
// }
