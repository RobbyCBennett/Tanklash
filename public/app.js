// const host = 'wss://tanklash.herokuapp.com'; // live
const host = 'ws://localhost:8080'; // local

var socket = new WebSocket(host);

// Global constants
const tick = 10;
const colors = [
	'tankRed',
	'tankOrange',
	'tankYellow',
	'tankGreen',
	'tankTeal',
	'tankSky',
	'tankBlue',
	'tankPurple',
	'tankPink',
];

// Global variables
var game = {};
var currentScreen = 'startScreen'; // startScreen, hostOrJoinScreen, hostScreen, joinScreen, mapScreen, gameScreen
var currentGameCode = '';
var currentName = ''
var playerNumber = 0
var maps = [];
var controls = {
	up: 'w',
	left: 'a',
	down: 's',
	right: 'd',
}
var controlState = {
	up: false,
	left: false,
	down: false,
	right: false,
	mouseX: 0,
	mouseY: 0,
	leftClick: false,
	rightClick: false,
}
var angleBarrel = 0;

// Disable right clicking in the game
document.getElementById('gameScreen').addEventListener('contextmenu', event => event.preventDefault());

// WS functions
function send(object) {
	socket.send(JSON.stringify(object));
}

socket.onmessage = function receive(event) {
	var data = JSON.parse(event.data);

	// Game objects
	if ('gameData' in data) {
		// Update game
		game = data.gameData;

		// Game code
		currentGameCode = game.code;
		document.getElementById('hostCode').value = currentGameCode;

		// Game over
		if (currentScreen == 'gameScreen' && game.winner != '') {
			document.getElementById('winner').innerHTML = game.winner + ' won!';
			drawGameObjects();
		}

		// Change screen
		if ((currentScreen == 'hostScreen' || currentScreen == 'joinScreen') && game.screen == 'mapScreen') {
			changeScreen(game.screen);
		}
		else if (currentScreen == 'mapScreen' && game.screen == 'gameScreen') {
			changeScreen(game.screen);
		}
		else if (currentScreen == 'gameScreen' && game.screen == 'mapScreen') {
			changeScreen(game.screen);
		}

		// Update host and start screen
		if (currentScreen == 'hostScreen' || currentScreen == 'joinScreen') {
			// Host start button
			if (currentScreen == 'hostScreen') {
				if (game.tanks.length > 1) {
					document.getElementById('start').classList.remove('hidden');
				} else {
					document.getElementById('start').classList.add('hidden');
				}
			} else {
				document.getElementById('joinCode').classList.remove('invalid');
			}

			// Update players in menu
			updatePlayerList();
		}
		// Draw votes
		else if (currentScreen == 'mapScreen') {
			drawVotes();
		}
	}
	// Receiving the maps
	else if ('mapData' in data) {
		maps = data.mapData;
		loadMapPreviews();
	}
	// Receiving the player number
	else if ('playerNumber' in data) {
		playerNumber = data.playerNumber;
	}
	// Error
	else if ('error' in data) {
		if (currentScreen == 'hostScreen' || currentScreen == 'joinScreen') {
			// Game code
			currentGameCode = '';
			document.getElementById('joinCode').classList.add('invalid');

			// Update game
			game = {};

			// Update players in menu
			updatePlayerList();
		}

		console.log('Error:', data.error);
	}
}

function requestHostCode() {
	send({
		'hostGame': 0,
		'name': localStorage.getItem('name'),
		'color': localStorage.getItem('color'),
	});
}

function requestJoinCode() {
	send({
		'joinGame': currentGameCode,
		'name': localStorage.getItem('name'),
		'color': localStorage.getItem('color'),
	});
}

function requestStart() {
	send({
		'startGame': currentGameCode,
	});
}

function requestMapVote(map) {
	send({
		'mapVote': map,
		'code': currentGameCode,
	});
}

function sendControlState() {
	send({
		'controlState': controlState,
		'code': currentGameCode,
	});
}

// Helper functions
function singleCharLower(key) {
	if (key.length == 1) {
		if (key.charCodeAt(0) >= 'A'.charCodeAt(0) && key.charCodeAt(0) <= 'Z'.charCodeAt(0)) {
			return key.toLowerCase(key);
		}
	}
	return key;
}

function copyCode() {
	var codeField = document.getElementById('hostCode');
	codeField.select();
	document.execCommand('copy');
	window.getSelection().removeAllRanges();

	var copiedMessage = document.getElementById('hostCodeCopied');
	copiedMessage.classList.add('fadeInAndOut');
	setTimeout(function () {
		copiedMessage.classList.remove('fadeInAndOut');
	}, 2000);
}


// Player config functions
function savePlayerName(name) {
	localStorage.setItem('name', name);
	currentName = name;
	send({'newName': name});
	updatePlayerList();
}

function savePlayerColor(currentColor) {
	for (var i = 0; i < colors.length; i++) {
		if (colors[i] == currentColor) {
			newI = i + 1;
			if (newI >= colors.length) {
				newI = 0;
			}
			var newColor = colors[newI];
			document.getElementById('editPlayerColor').className = newColor;
			document.getElementById('editPlayerColorBig').className = newColor;
			localStorage.setItem('color', newColor);
			send({'newColor': newColor});
			updatePlayerList();
			break;
		}
	}
}

function loadPlayerConfig() {
	// Name
	currentName = localStorage.getItem('name');
	document.getElementById('editPlayerName').value = currentName;

	// Color
	var colorName = localStorage.getItem('color');
	if (colors.includes(colorName)) {
		document.getElementById('editPlayerColor').className = colorName;
		document.getElementById('editPlayerColorBig').className = colorName;
	} else {
		localStorage.setItem('color', 'tankGreen');
		document.getElementById('editPlayerColor').className = 'tankGreen';
		document.getElementById('editPlayerColorBig').className = 'tankGreen';
	}
}
loadPlayerConfig();

function updatePlayerList() {
	var playerLists = document.getElementsByClassName('staticPlayers');
	for (var i = 0; i < playerLists.length; i++) {
		var playerList = playerLists[i];
		playerList.innerHTML = '';

		if ('tanks' in game) {
			for (var j = 0; j < game.tanks.length; j++) {
				var player = game.tanks[j];

				var playerDiv = document.createElement('div');
				playerDiv.className = 'staticPlayer';
				playerList.appendChild(playerDiv);

				var playerTank = document.createElement('div');
				playerTank.className = 'staticPlayerTank ' + player.color;
				playerDiv.appendChild(playerTank);

				var playerName = document.createElement('span');
				playerName.className = 'staticPlayerName allCaps';
				playerName.innerHTML = player.name;
				playerDiv.appendChild(playerName);
			}
		}
	}
}

function drawVotes() {
	// Clear the tanks
	var votes = document.getElementsByClassName('votes');
	for (var i = 0; i < votes.length; i++) {
		votes[i].innerHTML = '';
	}
	var noVotes = document.getElementById('noVotes');
	noVotes.innerHTML = '';

	// Place the tanks
	for (var i = 0; i < game.tanks.length; i++) {
		var tankVote = document.createElement('div');
		tankVote.className = 'tankVote staticPlayerTank ' + game.tanks[i].color;
		var tankVoteName = document.createElement('span');
		tankVoteName.innerHTML = game.tanks[i].name;
		tankVoteName.className = 'tankName allCaps';
		tankVote.appendChild(tankVoteName);
		if (game.tanks[i].mapVote) {
			document.getElementById(game.tanks[i].mapVote + 'votes').appendChild(tankVote);
		}
		else {
			noVotes.appendChild(tankVote);
		}
	}
}

// Navigation functions
function changeScreen(nextScreen) {
	if (nextScreen != currentScreen) {
		// Don't change screens: the player to make a username first
		if (currentScreen == 'hostOrJoinScreen' && (currentName == null || currentName == '')) {
			alert('First, type in your name. You can also click the tank to pick a tank color.');
			document.getElementById('editPlayerName').focus();
		}
		// Change screens
		else {
			// Wait in some cases
			var secondsToWait = 0;
			if (currentScreen == 'mapScreen' && nextScreen ==  'gameScreen') {
				secondsToWait = 1;
			}
			else if (currentScreen == 'gameScreen' && nextScreen == 'mapScreen') {
				secondsToWait = 3;
			}

			// Change the screen variable
			currentScreen = nextScreen;

			// Highlight the chosen map
			if (nextScreen == 'mapScreen') {
				drawVotes();
				var mapButtons = document.getElementsByClassName('mapButton');
				for (var i = 0; i < mapButtons.length; i++) {
					mapButtons[i].classList.remove('chosen');
				}
			}
			else if (nextScreen == 'gameScreen') {
				drawVotes();
				if (game.map) {
					document.getElementById(game.map).classList.add('chosen');

					// Load the map while the player is waiting
					loadGame();
				}
			}

			setTimeout(function() {
				// Change screen
				var screens = document.getElementsByClassName('fullscreen');
				for (var i = 0; i < screens.length; i++) {
					screens[i].classList.add('hidden');
				}
				document.getElementById(nextScreen).classList.remove('hidden');

				// Focus
				if (currentScreen == 'hostOrJoinScreen') {
					document.getElementById('host').focus();
				}
				else if (currentScreen == 'joinScreen') {
					document.getElementById('joinCode').focus();
				}

				// Automatically host game
				else if (currentScreen == 'hostScreen') {
					requestHostCode();
				}

				// Show or hide player config
				var playerConfig = document.getElementById('playerConfig');
				if (currentScreen == 'hostOrJoinScreen' || currentScreen == 'hostScreen' || currentScreen == 'joinScreen' || currentScreen == 'mapScreen') {
					playerConfig.classList.remove('hidden');
				}
				else if (currentScreen == 'gameScreen') {
					playerConfig.classList.add('hidden');
				}
			}, secondsToWait * 1000);
		}
	}
}

function navigateHostOrJoin(key, buttonID) {
	key = singleCharLower(key);

	var navigateKeys = [controls.down, controls.up];
	if (navigateKeys.includes(key)) {
		if (key == controls.down && buttonID == 'host') {
			setTimeout(function () {
				document.getElementById('join').focus();
			}, 1);
		}
		else if (key == controls.up && buttonID == 'join') {
			setTimeout(function () {
				document.getElementById('host').focus();
			}, 1);
		}
	}
}

function joinCodeChanged(code) {
	var joinCodeField = document.getElementById('joinCode');

	// Make it a string at most 4 long
	var codeComplete = false;
	code = code.toLowerCase(code);
	newCode = '';
	for (var i = 0; i < code.length; i++) {
		var char = code[i];
		if (char >= 'a' && char <= 'z') {
			newCode += char;
			if (newCode.length == 4) {
				codeComplete = true;
				break;
			}
		}
	}
	joinCodeField.value = newCode;

	if (codeComplete) {
		if (newCode != currentGameCode) {
			currentGameCode = newCode;
			requestJoinCode();
		}
	}
	else {
		joinCodeField.classList.remove('valid');
		joinCodeField.classList.remove('invalid');
	}
}

function loadMapPreviews() {
	// Blocks and powerups
	var mapButtons = document.getElementsByClassName('mapButton');

	for (var i = 0; i < mapButtons.length && i < maps.length; i++) {
		var mapPreviewTable = mapButtons[i].getElementsByTagName('table')[0];
		for (var y = 0; y < maps[i].length; y++) {
			var row = document.createElement('tr');
			mapPreviewTable.appendChild(row);
			for (var x = 0; x < maps[i][0].length; x++) {
				var blockCode = maps[i][y][x];
				var block = document.createElement('td');
				row.appendChild(block);

				// Block
				if (blockCode == 1) {
					block.className = 'block';
				}
				// Powerup
				else if (blockCode == 2) {
					block.className = 'powerupTripleShot';
				}
				else if (blockCode == 3) {
					block.className = 'powerupSpreadShot';
				}
				else if (blockCode == 4) {
					block.className = 'powerupSpeedShot';
				}
				else if (blockCode == 5) {
					block.className = 'powerupMine';
				}
			}
		}
	}
}

function loadGame() {
	var gameScreen = document.getElementById('gameScreen');

	// Reset control state
	controlState.up = false;
	controlState.left = false;
	controlState.down = false;
	controlState.right = false;

	// Winner
	document.getElementById('winner').innerHTML = '';

	// Background
	if (game.map.includes('desert')) {
		gameScreen.classList.add('desert');
		gameScreen.classList.remove('jungle');
	} else if (game.map.includes('jungle')) {
		gameScreen.classList.add('jungle');
		gameScreen.classList.remove('desert');
	}

	// Blocks
	var map = document.getElementById('map');
	map.innerHTML = '';
	for (var y = 0; y < maps[game.mapI].length; y++) {
		var row = document.createElement('tr');
		map.appendChild(row);
		for (var x = 0; x < maps[game.mapI][0].length; x++) {
			var blockCode = maps[game.mapI][y][x];
			var block = document.createElement('td');
			row.appendChild(block);

			// Block
			if (blockCode == 1) {
				block.className = 'block';
			}
		}
	}

	// Powerups
	for (var i = 0; i < game.powerups.length; i++) {
		var powerup = game.powerups[i];
		var type = powerup.type;
		var x = powerup.x;
		var y = powerup.y;

		if (type == 2) {
			map.childNodes[y].childNodes[x].className = 'powerupTripleShot';
		}
		else if (type == 3) {
			map.childNodes[y].childNodes[x].className = 'powerupSpreadShot';
		}
		else if (type == 4) {
			map.childNodes[y].childNodes[x].className = 'powerupSpeedShot';
		}
		else if (type == 5) {
			map.childNodes[y].childNodes[x].className = 'powerupMine';
		}
	}

	// Tanks
	var world = document.getElementById('world');
	world.innerHTML = '';
	for (var i = 0; i < game.tanks.length; i++) {
		var tank = game.tanks[i];
		var tankDiv = document.createElement('div');
		tankDiv.className = 'gameTank ' + tank.color;
		world.appendChild(tankDiv);

		var tankBody = document.createElement('div');
		tankBody.className = 'gameTankBody';
		tankDiv.appendChild(tankBody);

		var tankBarrel = document.createElement('div');
		tankBarrel.className = 'gameTankBarrel';
		tankDiv.appendChild(tankBarrel);

		tankDiv.style = 'transform: translate(' + tank.x*100 + '%, ' + tank.y*100 + '%)';
	}

	// Shots and mines
	for (var tankI = 0; tankI < game.tanks.length; tankI++) {
		var tank = game.tanks[tankI];
		for (var shotI = 0; shotI < tank.shots.length; shotI++) {
			var shot = tank.shots[shotI];

			var shotDiv = document.createElement('div');
			shotDiv.className = 'gameShot hidden';
			document.getElementById('world').appendChild(shotDiv);

			var shotShellDiv = document.createElement('div');
			shotShellDiv.className = 'gameShotShell';
			shotDiv.appendChild(shotShellDiv);

			shotDiv.style = 'transform: translate(' + shot.x*100 + '%, ' + shot.y*100 + '%)';
		}

		// for (var mineI = 0; mineI < game.tanks[tankI].length; mineI++) {
		// 	var mine = game.tanks[tankI].shots[mineI];
		//
		// 	var mineDiv = document.createElement('div');
		// 	mineDiv.className = 'gameShot';
		// 	document.getElementById('world').appendChild(mineDiv);
		//
		// 	var shotShellDiv = document.createElement('div');
		// 	shotShellDiv.className = 'gameShotShell';
		// 	mineDiv.appendChild(shotShellDiv);
		//
		// 	mineDiv.style = 'transform: translate(' + shot.x*100 + '%, ' + shot.y*100 + '%)';
		// }
	}
}

function gameKeys(event, pressed) {
	var key = event.key;
	var timeStamp = event.timeStamp;

	var valid = [controls.up, controls.left, controls.down, controls.right];
	if (valid.includes(key)) {
		// Ignore holds
		if (pressed) {
			if (key == controls.up && controlState.up) {
				return;
			}
			else if (key == controls.left && controlState.left) {
				return;
			}
			else if (key == controls.down && controlState.down) {
				return;
			}
			else if (key == controls.right && controlState.right) {
				return;
			}
		}

		// Update control states
		if (key == controls.up) {
			controlState.up = pressed;
		}
		else if (key == controls.left) {
			controlState.left = pressed;
		}
		else if (key == controls.down) {
			controlState.down = pressed;
		}
		else if (key == controls.right) {
			controlState.right = pressed;
		}

		sendControlState();
	}
}

function drawGameObjects() {
	if (currentScreen == 'gameScreen') {

		// Reset left click and right click
		if (controlState.leftClick) {
			controlState.leftClick = false;
		}
		if (controlState.rightClick) {
			controlState.rightClick = false;
		}

		// Draw objects
		var tankDivs = document.getElementsByClassName('gameTank');
		for (var i = 0; i < game.tanks.length; i++) {
			var tank = game.tanks[i];
			var tankDiv = tankDivs[i];

			// Draw tank
			if (tank.alive) {
				var tankBody = tankDiv.getElementsByClassName('gameTankBody')[0];
				var tankBarrel = tankDiv.getElementsByClassName('gameTankBarrel')[0];
				tankDiv.style = 'transform: translate(' + tank.x*100 + '%, ' + tank.y*100 + '%)';
				tankBody.style = 'transform: rotate(' + tank.angleBody + 'deg)';
				tankBarrel.style = 'transform: rotate(' + tank.angleBarrel + 'deg)';
				tankDiv.classList.remove('explosion');
			}
			else if (!tankDiv.classList.contains('explosion')) {
				tankDiv.classList.add('explosion');
			}

			// Draw shots
			var shotDivs = document.getElementsByClassName('gameShot');
			for (var j = 0; j < tank.shots.length; j++) {
				var shot = tank.shots[j];
				var shotDiv = shotDivs[i * tank.shots.length + j];
				if (shot.alive) {
					shotDiv.style = 'transform: translate(' + shot.x*100 + '%, ' + shot.y*100 + '%)';
					shotDiv.classList.remove('hidden');
				}
				else if (!shotDiv.classList.contains('hidden')) {
					shotDiv.classList.add('hidden');

					explosion = document.createElement('div');
					document.getElementById('world').appendChild(explosion);
					explosion.dataset.timeCreated = Date.now();
					explosion.className = 'gameShotExplosion explosion debrisExplosion';
					explosion.style = 'transform: translate(' + shot.x*100 + '%, ' + shot.y*100 + '%)';
				}
			}
		}
	}
}
setInterval(function () {
	drawGameObjects();
}, tick);


// Cleanup explosions
function removeExplosions() {
	if (currentScreen == 'gameScreen') {
		var explosions = document.getElementsByClassName('debrisExplosion');
		for (var i = 0; i < explosions.length; i++) {
			var explosion = explosions[i];
			if (parseInt(explosion.dataset.timeCreated) + 2000 < Date.now()) {
				explosion.remove();
			}
		}
	}
}
setInterval(function () {
	removeExplosions();
}, 10 * 1000);


// Fix for Heroku
setInterval(function () {
	send({'spam': 0});
}, 30 * 1000);

// Game mouse controls
document.onmousemove = function setMousePosition(event) {
	if (currentScreen == 'gameScreen') {
		var mapBox = document.getElementById('map').getBoundingClientRect();

		var top = mapBox.top;
		var left = mapBox.left;
		var bottom = mapBox.bottom;
		var right = mapBox.right;

		var xRatio = (event.clientX - left) / (right - left);
		var yRatio = (event.clientY - top) / (bottom - top);

		var width = maps[game.mapI][0].length
		var height = maps[game.mapI].length

		var x = xRatio * width;
		var y = yRatio * height;

		controlState.mouseX = x;
		controlState.mouseY = y;

		sendControlState();
	}
}
document.body.onmousedown = function (event) {
	if (currentScreen == 'gameScreen') {
		var leftClick = event.which == 1;
		var rightClick = event.which == 3;

		if (leftClick || rightClick) {
			controlState.leftClick = leftClick;
			controlState.rightClick = rightClick;

			sendControlState();
		}
	}
}


// Game keyboard controls
function keyUp(event) {
	var key = event.key;
	if (currentScreen == 'startScreen') {
		var valid = [controls.up, controls.left, controls.down, controls.right];
		if (valid.includes(key)) {
			changeScreen('hostOrJoinScreen');
		}
	}
	else if (currentScreen == 'gameScreen') {
		gameKeys(event, false);
	}
}
document.body.onkeyup = function () {
	keyUp(event);
}
function keyDown(event) {
	if (currentScreen == 'gameScreen') {
		gameKeys(event, true);
	}
}
document.body.onkeydown = function () {
	keyDown(event);
}
