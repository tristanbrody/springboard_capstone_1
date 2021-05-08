// let test1 = "some_var"

// let test2 = test1.split("_");
// let test3 = test2.join(' ');
// test3.title();



// const myObj = {
//     someFunc: function(){
//         console.log('inside function in object');
//     }
// }

// myObj['someFunc']();

function title(phrase) {
	//remove underscores and capitalize results from API
	return phrase
		.split('_')
		.map(word => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

console.log(title('address_state'));

for (let li of ['Overview', 'Financial Data', 'Overview']) {
	console.log(li);
}

let myText = 'text'
let text = 'somethingElse';
myText.toLowerCase();
console.log(eval(myText) + 'A');