const addressForm = document.querySelector('#form-address-search');

addressForm.addEventListener('submit', submitAddressForm);

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
		let ul = document.createElement('ul');
		let div = document.createElement('div');
		if (
			open_secrets_resp.response.legislator[x]['@attributes']['office'] ===
			`${google_resp['address']['state'].toUpperCase()}${congressionalDistrict}`
		) {
			let h4 = document.createElement('h4');
			let i = document.createElement('i');
			i.classList.add('fas');
			i.classList.add('fa-angle-down');
			let moreData = document.createElement('li');
			moreData.innerText = 'Financial data';
			moreData.style.cursor = 'pointer';
			h4.innerText = 'office: District Representative';
			for (const [key, value] of Object.entries(open_secrets_resp.response.legislator[x]['@attributes'])) {
				let li = document.createElement('li');
				li.innerText = `${key}: ${value}`;
				ul.append(li);
			}
			let i2 = document.createElement('i');
			i2.classList.add('fas');
			i2.classList.add('fa-angle-right');
			i2.classList.add('fa-sm');
			i2.dataset.legislator = open_secrets_resp.response.legislator[x]['@attributes']['firstlast'];
			i2.dataset.state = google_resp['address']['state'];
			ul.append(moreData);
			ul.append(i2);
			div.append(ul);
			i.dataset.legislator = `${open_secrets_resp.response.legislator[x]['@attributes']['firstlast']}-top`;
			localStorage.setItem(
				`${i.dataset.legislator}`,
				JSON.stringify({
					legislator: open_secrets_resp.response.legislator[x]['@attributes'],
					state: i2.dataset.state
				})
			);
			i.addEventListener('click', e => {
				// 'top-level-arrow' on legislator data has been clicked. Toggle it and check what class it currently contains to determine whether or not we need to remove data from the DOM or grab it from local storage and re-add
				let el = toggleArrowElement(e.target);
				if (el.classList.contains('fa-angle-down')) {
					let localStorageData = JSON.parse(localStorage.getItem(e.target.dataset.legislator));
					addTopDataForLegislatorToDom(localStorageData, e.target);
				} else {
					e.target.nextSibling.innerText = '';
				}
			});
			i2.addEventListener('click', appendLegislatorFinancialData);
			addFollowButtonToDOM(open_secrets_resp.response.legislator[x], h4);
			document.querySelector('#results-ul').append(h4);
			document.querySelector('#results-ul').append(i);
			document.querySelector('#results-ul').append(div);
		}
		//TODO add event listener here
	}

	//also want to display legislator data from Google's API

	for (let legislator of google_resp['legislators']) {
		let div = document.createElement('div');
		let ul = document.createElement('ul');
		let h4 = document.createElement('h4');
		let i = document.createElement('i');
		i.classList.add('fas');
		i.classList.add('fa-angle-down');
		i.dataset.legislator = `${google_resp['address']['state']}-${legislator['data']['name']}-top`;
		console.dir(legislator);
		i.addEventListener('click', e => {
			// 'top-level-arrow' on legislator data has been clicked. Toggle it and check what class it currently contains to determine whether or not we need to remove data from the DOM or grab it from local storage and re-add
			let el = toggleArrowElement(e.target);
			if (el.classList.contains('fa-angle-down')) {
				let localStorageData = JSON.parse(localStorage.getItem(e.target.dataset.legislator));
				addTopDataForLegislatorToDom(localStorageData, e.target);
			} else {
				e.target.nextSibling.innerText = '';
			}
		});
		let moreData = document.createElement('li');
		moreData.innerText = 'Financial data';
		moreData.style.cursor = 'pointer';
		h4.innerText = `office: ${legislator['office']}`;
		for (const [key, value] of Object.entries(legislator['data'])) {
			if (key !== 'address' && key !== 'channels') {
				let li = document.createElement('li');
				li.innerText = `${key}: ${value}`;
				ul.prepend(h4);
				ul.append(li);
			}
		}
		let i2 = document.createElement('i');
		i2.classList.add('fas');
		i2.classList.add('fa-angle-right');
		i2.classList.add('fa-sm');
		i2.dataset.legislator = legislator['data']['name'];
		i2.dataset.state = google_resp['address']['state'];
		ul.append(moreData);
		ul.append(i2);
		i2.addEventListener('click', appendLegislatorFinancialData);
		div.append(ul);
		document.querySelector('#results-ul').append(h4);
		document.querySelector('#results-ul').append(i);
		document.querySelector('#results-ul').append(div);
		addFollowButtonToDOM(legislator, h4);
		localStorage.setItem(
			`${i.dataset.legislator}`,
			JSON.stringify({
				legislator: legislator['data'],
				state: i2.dataset.state
			})
		);
	}

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

async function appendLegislatorFinancialData(e) {
	//called from event listener. Calls out to functions that make API calls to get a given legislator's unique id and financial data for their most recent election cycle

	let legislator = e.target.dataset.legislator;
	let state = e.target.dataset.state;

	//clicked data attribute is set to True if user has already clicked on this - this is to prevent duplicate API calls
	if (e.target.dataset.clicked === 'true') {
		//retrieve data from local storage, since search for financial data was already completed
		//if arrow clicked has 'right' class list, data needs to be re-added to DOM
		if (e.target.classList.contains('fa-angle-right')) {
			const retrievedFinancialData = JSON.parse(window.localStorage.getItem(`${state}-${legislator}-financial`));
			console.dir(retrievedFinancialData);
			addFinancialDataForLegislatorToDOM(retrievedFinancialData, e.target);
		}
		//otherwise data should be removed from DOM
		else {
			e.target.nextSibling.innerText = '';
		}
	} else {
		const legislatorData = await getLegislatorFECId(legislator, state);
		const financialData = await getLegislatorFinancialData(legislatorData['candidate_id'], legislatorData['cycle']);
		let target = document.querySelector(`[data-legislator=${CSS.escape(legislator)}]`);
		addFinancialDataForLegislatorToDOM(financialData, target);
		e.target.dataset.clicked = 'true';

		//add financial data to local storage so it can be hidden/re-displayed
		//local storage will use a key of state-legislator-financial
		localStorage.setItem(`${state}-${legislator}-financial`, JSON.stringify(financialData));
	}
	toggleArrowElement(e.target);
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
	if (financialData.length > 0) {
		for (const [key, value] of Object.entries(financialData[0])) {
			let li = document.createElement('li');
			li.innerText = `${key}: ${value}`;
			ul.append(li);
		}
	} else {
		let p = document.createElement('p');
		p.innerText = 'No financial data found for most recent election cycle';
		ul.append(p);
	}
	target.insertAdjacentElement('afterend', ul);
}

function addTopDataForLegislatorToDom(legislatorData, target) {
	//given an object with data about a legislator, and a target, add specific info from the data to DOM
	let moreData = document.createElement('li');
	moreData.innerText = 'Financial data';
	moreData.style.cursor = 'pointer';
	let div = document.createElement('div');
	let ul = document.createElement('ul');
	for (const [key, value] of Object.entries(legislatorData['legislator'])) {
		if (key !== 'address' && key !== 'channels') {
			let li = document.createElement('li');
			li.innerText = `${key}: ${value}`;
			ul.append(li);
		}
	}
	let i2 = document.createElement('i');
	i2.classList.add('fas');
	i2.classList.add('fa-angle-right');
	i2.classList.add('fa-sm');
	console.dir(legislatorData);
	i2.dataset.legislator = legislatorData['legislator']['name'];
	i2.dataset.state = legislatorData['state'];
	ul.append(moreData);
	ul.append(i2);
	i2.addEventListener('click', appendLegislatorFinancialData);
	div.append(ul);
	target.insertAdjacentElement('afterend', ul);

	target.append(div);
}

function addFollowButtonToDOM(legislatorData, target) {
	// given an object with data about a legislator added to the DOM from search results, create a button with event listener to 'follow' the legislator
	const btn = document.createElement('button');
	btn.classList.add('btn', 'btn-sm', 'btn-primary', 'ml-3');
	btn.innerText = 'Follow Legislator';
	btn.dataset.candidate_id = legislatorData['candidate_id'];
	target.append(btn);
}
