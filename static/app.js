/*
COMMENTED OUT TO AVOID BREAKING JASMINE TESTS 
const addressForm = document.querySelector('#form-address-search');

const dataPoints = ['Overview', 'Financial Data', 'Expenditures'];

const today = new Date();

const openFECFinancialDataPoints = [
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
];

addEventListener(document.querySelector('.overlay'), 'toggleOverlay', 'click');
addressForm.addEventListener('submit', submitAddressForm);

//event listener for logout button so we can clear local storage

//determine if user is logged in based on response from our server, and re-add event listeners to DOM accordingly
(async function () {
	let checkLocalStorage = getMostRecentSearch();
	document.querySelector('#results-ul').innerHTML = checkLocalStorage;
	const loggedIn = await getCurrentUserState();
	localStorage.setItem('logged-in', loggedIn['response']['logged-in']);
	reAddEventListeners();
	reAddEventListenersToFollowLegislatorButtons();
	if (loggedIn === 'True') {
		addEventListener(document.querySelector('.button--logout', 'logout', 'click'));
		reAddFollowedRelationships();
	}
})();
*/
async function submitAddressForm(e) {
	e.preventDefault();
	clearPreviousSearch();

	const data = new FormData(e.target);
	const formData = Object.fromEntries(data.entries());
	delete formData.crsf_token;

	//need to get all legislators the user is following, assuming they're logged in
	const followedByUserArray = await getFollowedLegislators(localStorage.getItem('logged-in'));

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

		const filteredResponse = filterAPIResponse({ ...open_secrets_resp.response.legislator[x]['@attributes'] }, [
			'firstlast',
			'feccandid',
			'party',
			'office',
			'phone',
			'website'
		]);

		let h4 = setCardTitle('District Representative', name);

		if (office === `${google_resp['address']['state'].toUpperCase()}${congressionalDistrict}`) {
			let newElements = addSearchResultsToDOM(filteredResponse, name, google_resp['address']['state']);
			let following = false;
			if (followedByUserArray.includes(`${name}-${google_resp['address']['state'].toUpperCase()}`)) {
				following = true;
			}
			addFollowButtonToDOM(filteredResponse['firstlast'], google_resp['address']['state'], h4, following);
			document.querySelector('#results-ul').append(h4);
			document.querySelector('#results-ul').append(newElements['i']);
			document.querySelector('#results-ul').append(newElements['cardDiv']);
		}
	}

	//also want to display legislator data from Google's API

	for (let legislator of google_resp['legislators']) {
		let h4 = setCardTitle(legislator['office'], legislator['data']['name']);
		const filteredResponse = filterAPIResponse({ ...legislator['data'] }, ['address', 'channels'], true);

		let newElements = addSearchResultsToDOM(
			filteredResponse,
			legislator['data']['name'],
			google_resp['address']['state']
		);
		let following = false;
		if (
			followedByUserArray.includes(
				`${legislator['data']['name']}-${google_resp['address']['state'].toUpperCase()}`
			)
		) {
			following = true;
		}
		addFollowButtonToDOM(filteredResponse['name'], google_resp['address']['state'], h4, following);
		document.querySelector('#results-ul').append(h4);
		document.querySelector('#results-ul').append(newElements['i']);
		document.querySelector('#results-ul').append(newElements['cardDiv']);
	}
	document.querySelector('#results-ul').prepend(`Results for ${google_resp['address']['fullAddress']}:`);
	cacheMostRecentSearch(document.querySelector('#results-ul').innerHTML);

	//send search query to our endpoint to save to DB
	if (localStorage.getItem('logged-in') === 'True') {
		fetch('/update-search-history', {
			method: 'post',
			body: JSON.stringify(formData)
		});
	}
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

async function getLegislatorExpenditureData(candidate_id) {
	//provided a unique FEC candidate id, call our endpoint to look them up on Open FEC's API & get data on expenditures

	const res = await fetch('/api/legislator/expenditures', {
		method: 'post',
		body: JSON.stringify({ candidate_id })
	}).then(response => response.json());
	//parse res to get financial data
	let expenditureData = res.results;
	return expenditureData;
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
	target.append(ul);
}

function addExpenditureDataForLegislatorToDOM(financialData, target) {
	let parentDiv = document.createElement('div');
	// try {
	if (financialData.length > 0) {
		for (let _ of financialData) {
			let div = document.createElement('div');
			let ul = document.createElement('ul');
			for (const [key, value] of Object.entries(_)) {
				let li = document.createElement('li');
				li.innerText = `${title(key)}: ${value}`;
				ul.append(li);
			}
			div.append(ul);
			parentDiv.append(div);
		}
	} else {
		let p = document.createElement('p');
		p.innerText = 'No expenditure data found for last 4 years';
		parentDiv.append(p);
	}
	target.append(parentDiv);
}

function addFollowButtonToDOM(name, state, target, following = false) {
	// given variables for a legislator's name and state, create a button with event listener to 'follow' the legislator
	const btn = document.createElement('button');
	btn.classList.add('btn', 'btn-sm', 'btn-primary', 'ml-3', 'button--follow-legislator');
	btn.innerText = 'Follow Legislator';
	if (following) {
		btn.innerText = 'following';
		btn.classList.add('following');
		btn.dataset.following = 'True';
	}
	btn.dataset.name = name;
	btn.dataset.state = state;
	let loggedIn = localStorage.getItem('logged-in');
	if (loggedIn === 'True') {
		addEventListener(btn, 'followLegislator', 'click');
	} else {
		addEventListener(btn, 'toggleOverlay', 'click');
	}
	target.append(btn);
}

function cacheMostRecentSearch(search) {
	//save data for most recent search to local storage
	localStorage.setItem('mostRecentSearch', search);
}

function getMostRecentSearch() {
	//get most recent search saved in local storage
	return localStorage.getItem('mostRecentSearch');
}

function addSearchResultsToDOM(response, name = 'not passed in', state = 'not passed in') {
	//function takes in object that only has specific properties we want to display for a given API response, and, optionally, separate variables for name and state of legislator. Returns DOM elements needed to display this info
	const cardDiv = document.createElement('div');
	cardDiv.classList.add('card', 'text-left', 'mt-2', 'mb-2');
	const nestedDiv = document.createElement('div');
	nestedDiv.classList.add('card-header');
	cardDiv.append(nestedDiv);
	const nestedUl = document.createElement('ul');
	nestedUl.classList.add('nav', 'nav-tabs', 'card-header-tabs');
	nestedDiv.append(nestedUl);
	for (let liText of dataPoints) {
		const liNavItem = document.createElement('li');
		liNavItem.classList.add('nav-item');
		nestedUl.append(liNavItem);
		const anchor = document.createElement('a');
		anchor.classList.add('nav-link');
		anchor.innerText = liText;
		anchor.href = 'javascript:void(0)';
		anchor.dataset.legislator = name;
		anchor.dataset.state = state;
		if (liText === 'Overview') {
			anchor.dataset.section = 'overview';
			anchor.dataset.linkedUl = 'overviewUl';
			localStorage.setItem(`${state}-${name}-active-item-ul`, 'overviewUl');
			localStorage.setItem(`${state}-${name}-active-item-anchor`, 'overviewAnchor');
		}
		if (liText === 'Financial Data') {
			anchor.dataset.section = 'financial';
			anchor.dataset.linkedUl = 'financialUl';
		}
		if (liText === 'Expenditures') {
			anchor.dataset.section = 'expenditures';
			anchor.dataset.linkedUl = 'expendituresUl';
		}
		anchor.dataset.financial_section = 'True';
		anchor.dataset.clicked = 'false';
		anchor.dataset.key = `${name}-${anchor.dataset.section}-anchor`;
		addEventListener(anchor, 'changeLegislatorCardTab', 'click');
		if (liText === 'Overview') {
			anchor.classList.add('active');
		}
		liNavItem.append(anchor);
	}

	let ul = document.createElement('ul');
	ul.classList.add('card-overview-ul');
	ul.dataset.key = `${name}-overview-ul`;
	ul.dataset.legislator = name;
	ul.dataset.state = state;
	ul.dataset.expenditures_section = 'True';
	const ulFinancialData = document.createElement('ul');
	ulFinancialData.classList.add('card-financial-ul', 'hidden');
	const ulExpendituresData = document.createElement('ul');
	ulExpendituresData.classList.add('card-expenditures-ul', 'hidden');
	let div = document.createElement('div');
	div.classList.add('card-body');
	for (const [key, value] of Object.entries(response)) {
		let li = document.createElement('li');
		li.innerText = `${title(key)}: ${value}`;
		ul.append(li);
	}

	let i = document.createElement('i');
	i.classList.add('fas');
	i.classList.add('fa-angle-down');

	div.append(ul);
	cardDiv.append(div);
	i.dataset.legislator = `${name}-top`;
	cardDiv.dataset.legislator = `${name}-top-div`;
	localStorage.setItem(
		`${i.dataset.legislator}`,
		JSON.stringify({
			legislator: response,
			state
		})
	);
	addEventListener(i, 'toggle-arrow-top', 'click');
	ulFinancialData.dataset.key = `${name}-financial-ul`;
	ulFinancialData.dataset.legislator = name;
	ulFinancialData.dataset.state = state;
	ulFinancialData.dataset.financial_section = 'True';
	ulFinancialData.dataset.section = 'financial';
	ulExpendituresData.dataset.legislator = name;
	ulExpendituresData.dataset.key = `${name}-expenditures-ul`;
	ulExpendituresData.dataset.state = state;
	ulExpendituresData.dataset.expenditures_section = 'True';
	ulExpendituresData.dataset.section = 'expenditures';
	ul.insertAdjacentElement('afterend', ulFinancialData);
	ul.insertAdjacentElement('afterend', ulExpendituresData);
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
				let el = document.querySelector(`[data-legislator=${CSS.escape(element.dataset.legislator)}-div]`);
				el.classList.remove('hidden');
			} else {
				let el = document.querySelector(`[data-legislator=${CSS.escape(element.dataset.legislator)}-div]`);
				el.classList.add('hidden');
			}
		},
		changeLegislatorCardTab: async function (e) {
			//called from event listener. Calls out to functions that make API calls to get a given legislator's unique id and financial data for their most recent election cycle
			let legislator = e.target.dataset.legislator;
			let state = e.target.dataset.state;
			let section = e.target.dataset.section;
			let activeAnchorUl = localStorage.getItem(`${state}-${legislator}-active-item-ul`);
			let activeAnchor = localStorage.getItem(`${state}-${legislator}-active-item-anchor`);
			if (e.target.dataset.linkedUl === activeAnchorUl) {
				return false;
			} else {
				// let activeAnchor = localStorage.getItem(`${state}-${legislator}-active-item-ul`);
				let overviewUl = document.querySelector(`[data-key=${CSS.escape(legislator)}-overview-ul]`);
				let financialUl = document.querySelector(`[data-key=${CSS.escape(legislator)}-financial-ul]`);
				let expendituresUl = document.querySelector(`[data-key=${CSS.escape(legislator)}-expenditures-ul]`);
				eval(activeAnchorUl).classList.toggle('hidden');

				let overviewAnchor = document.querySelector(`[data-key=${CSS.escape(legislator)}-overview-anchor]`);
				let financialAnchor = document.querySelector(`[data-key=${CSS.escape(legislator)}-financial-anchor]`);
				let expendituresAnchor = document.querySelector(
					`[data-key=${CSS.escape(legislator)}-expenditures-anchor]`
				);
				eval(activeAnchor).classList.toggle('active');
				e.target.classList.toggle('active');

				localStorage.setItem(`${state}-${legislator}-active-item-ul`, `${e.target.dataset.section}Ul`);
				localStorage.setItem(`${state}-${legislator}-active-item-anchor`, `${e.target.dataset.section}Anchor`);

				if (e.target.dataset.section === 'financial' && e.target.dataset.clicked === 'false') {
					const financialDataObj = await getDataForFinancialTab(legislator, state);
					e.target.dataset.clicked = 'true';
					e.target.legislator = legislator;
					addFinancialDataForLegislatorToDOM([financialDataObj], eval(e.target.dataset.linkedUl));

					//add financial data to local storage so it can be hidden/re-displayed
					//local storage will use a key of state-legislator-financial
					localStorage.setItem(`${state}-${legislator}-${section}`, JSON.stringify(financialDataObj));
				}

				if (e.target.dataset.section === 'expenditures' && e.target.dataset.clicked === 'false') {
					//TODO create these functions
					const expenditureDataObj = await getDataForExpendituresTab(legislator, state);
					e.target.dataset.clicked = 'true';
					e.target.legislator = legislator;
					addExpenditureDataForLegislatorToDOM(expenditureDataObj, eval(e.target.dataset.linkedUl));
					// add expenditure data to local storage so it can be hidden/re-displayed
					// local storage will use a key of state-legislator-expenditure
					localStorage.setItem(`${state}-${legislator}-${section}`, JSON.stringify(expenditureDataObj));
				}

				eval(e.target.dataset.linkedUl).classList.toggle('hidden');
				cacheMostRecentSearch(document.querySelector('#results-ul').innerHTML);
			}
		},
		toggleOverlay: function (e) {
			//handles clicks on 'follow legislator' when user is not logged in
			if (
				e.target.parentElement.classList.contains('form--inside-overlay') ||
				e.target.classList.contains('form--inside-overlay') ||
				e.target.classList.contains('overlay-child-container')
			) {
				return false;
			}
			document.querySelector('.overlay').classList.toggle('hidden');
		},
		followLegislator: async function (e) {
			//handles clicks on 'follow legislator' when user is logged in
			//call our endpoint to handle adding new 'follow' record to database, or to remove following record if they clicked to unfollow
			const name = e.target.dataset.name;
			const state = e.target.dataset.state;
			if (e.target.innerText === 'following') {
				const response = await fetch('/unfollow-legislator', {
					method: 'post',
					body: JSON.stringify({
						name,
						state
					})
				});
				e.target.classList.toggle('following');
				e.target.innerText = 'Follow Legislator';
			} else {
				const response = await fetch('/follow-legislator', {
					method: 'post',
					body: JSON.stringify({
						name,
						state
					})
				});
				e.target.classList.add('following');
				e.target.innerText = 'following';
			}
			cacheMostRecentSearch(document.querySelector('#results-ul').innerHTML);
		},
		logout: async function (e) {
			localStorage.clear();
			setTimeout(function () {
				// fetch('/logout', { method: 'get' });
				fetch('/logout', { method: 'get' });
			}, 3000);
		}
	};
	element.addEventListener(type, eventListeners[name]);
}

function reAddEventListeners() {
	//if page is refreshed, re-add relevant event listeners to search results
	const allAnchorTags = document.querySelectorAll('a');
	for (let el of Array.from(allAnchorTags)) {
		if (el.href === 'javascript:void(0)') {
			addEventListener(el, 'changeLegislatorCardTab', 'click');
		}
	}
	for (let el of Array.from(document.querySelectorAll('i'))) {
		addEventListener(el, 'toggle-arrow-top', 'click');
	}
}

function reAddEventListenersToFollowLegislatorButtons() {
	//if page is refreshed, re-add event listener to 'Follow Legislator' button in search results
	for (let el of Array.from(document.querySelectorAll('button.button--follow-legislator'))) {
		let loggedIn = localStorage.getItem('logged-in');
		if (loggedIn === 'True') {
			addEventListener(el, 'followLegislator', 'click');
		} else {
			addEventListener(el, 'toggleOverlay', 'click');
		}
	}
}

async function reAddFollowedRelationships() {
	//if page is refreshed, check that follows displayed in search results are still accurate
	const followedByUserArray = getFollowedLegislators(localStorage.getItem('logged-in'));
	for (let el of Array.from(document.querySelectorAll('button.button--follow-legislator'))) {
		if (followedByUserArray.includes(`${el.dataset.name}-${el.dataset.state.toUpperCase()}`)) {
			el.innerText = 'following';
			el.classList.add('following');
			el.dataset.following = 'True';
		}
	}
}

async function getCurrentUserState() {
	//call our endpoint to get server-side data re if user is currently logged in - response object has string "True" or "False"
	return await fetch('/userstate', {
		method: 'get'
	}).then(response => response.json());
}

async function getFollowedLegislators(loggedIn) {
	const followedByUserArray = [];
	if (loggedIn === 'True') {
		const followedByUser = await fetch('/following', {
			method: 'get'
		}).then(response => response.json());
		for (let rep of followedByUser['following']) {
			followedByUserArray.push(`${rep.name}-${rep.state.toUpperCase()}`);
		}
	}
	return followedByUserArray;
}

function setCardTitle(office, name) {
	let h4 = document.createElement('h4');
	h4.innerText = `${office} | ${name}`;
	return h4;
}

function filterAPIResponse(object, propertiesToKeep, flip = false) {
	//accepts an object returned from API and an array of properties to keep. Deletes all other properties in object and returns updated object. Optional argument will 'flip' logic and keep everything except the elements in array
	for (let key in object) {
		if (propertiesToKeep.includes(key) === (flip ? true : false)) {
			delete object[key];
		}
	}
	return object;
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

async function getDataForFinancialTab(legislator, state) {
	//accepts legislator and state and returns data for 'financial' tab on search results (pulled from OpenFEC API)
	const legislatorData = await getLegislatorFECId(legislator, state);
	const data = await getLegislatorFinancialData(legislatorData['candidate_id'], legislatorData['cycle']);
	//loop through response and delete the properties we don't need
	return filterAPIResponse(data[0], openFECFinancialDataPoints);
}

async function getDataForExpendituresTab(legislator, state) {
	//accepts legislator and state and returns data for 'expenditures' tab on search results (pulled from OpenFEC API)
	const legislatorData = await getLegislatorFECId(legislator, state);
	const data = await getLegislatorExpenditureData(legislatorData['candidate_id']);
	const filtered = filterAPIResponse(data, ['Count', 'Total'], true);

	//filter the results to cycles within the last 4 years
	return filtered.filter(obj => obj['cycle'] >= today.getFullYear() - 4);
}
