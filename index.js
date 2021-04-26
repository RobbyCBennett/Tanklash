const express = require('express')
const WebSocket = require('ws')
const lineReader = require('line-reader')

const port = process.env.PORT || 8080

const app = express()
app.use(express.static('public'))

// Global constants
const codeLength = 4
const playerIdLength = 20

const maxGameCount = 26 ** 4
const maxTankCount = 6

const maxNameLength = 12

const tick = 10

const tankShotHitRadius = 0.5
const shotSpawnDistance = 10

const shotCount = 3
const mineCount = 3

const shotWait = 500
const tripleShotwait = 250
const mineWait = 1000

const shotSpeed = 0.05
const fastShotMultiplier = 2

const tankSpeed = 0.025
const tankRotateSpeed = 1

const mapNames = ['desert1', 'desert2', 'desert3', 'jungle1', 'jungle2', 'jungle3']
var maps = new Array(mapNames.length)
var allMapSpawns = []

// Enumerators
const Collision = Object.freeze({'none':0, 'horizontal':1, 'vertical':2, 'both':3})
const Special = Object.freeze({'none':0, 'triple':1, 'spread':2, 'speed':3, 'mine':4})

// Global variables
var games = {} // Key: gameCode, Value: game object
var gamePlayerIds = {} // Key: gameCode, Value: playerId
var clients = {} // Key: playerId, Value: client

// Classes
class Powerup {
	constructor(x, y, type) {
		this.x = x
		this.y = y

		this.type = type
	}
}
class Mine {
	constructor() {
		this.alive = false

		this.x = 0
		this.y = 0
	}

	spawn(x, y) {
		this.alive = true

		this.x = x
		this.y = y
	}
}
class Shot {
	constructor() {
		this.alive = false

		this.x = 0
		this.y = 0

		this.bounced = false

		this.dx = 0
		this.dy = 0

		this.fast = false
	}

	spawn(x, y, degrees, fast) {
		this.alive = true

		this.bounced = false

		this.dx = shotSpeed * Math.cos(degrees * 3.141592 / 180)
		this.dy = shotSpeed * Math.sin(degrees * 3.141592 / 180)

		this.x = x + this.dx * shotSpawnDistance
		this.y = y + this.dy * shotSpawnDistance

		if (fast) {
			this.dx *= fastShotMultiplier
			this.dy *= fastShotMultiplier
		}

		this.fast = fast
	}
}
class Tank {
	constructor(name, color) {
		this.setName(name)
		this.color = color

		this.x = 0
		this.y = 0

		this.mapVote = ''

		this.connected = true
		this.controlState = {}

		this.shots = []
		this.mines = []
		this.createShotsAndMines()
		this.reset()
	}

	setName(name) {
		if (name.length > maxNameLength) {
			name = 'abcdefghijklmnop'.substring(0, maxNameLength)
		}
		this.name = name
	}

	createShotsAndMines() {
		for (var i = 0; i < shotCount; i++) {
			this.shots.push(new Shot())
		}

		for (var i = 0; i < mineCount; i++) {
			this.mines.push(new Mine())
		}
	}

	reset() {
		if (this.connected) {
			this.alive = true
		}
		else {
			this.alive = false
		}

		this.angleBody = 0
		this.angleBarrel = 0

		this.timeLastShot = 0
		this.timeLastMine = 0

		this.specialAmmo = 0
		this.specialType = Special.none

		for (var i = 0; i < this.shots.length; i++) {
			this.shots[i].alive = false
		}
	}

	shoot() {
		var now = Date.now()

		if (now >= this.timeLastShot + shotWait) {
			for (var i = 0; i < this.shots.length; i++) {
				var shot = this.shots[i]
				if (shot.alive == false) { // Find a shot that isn't being used
					shot.spawn(this.x, this.y, this.angleBarrel, false)
					this.timeLastShot = now
					break
				}
			}
		}
	}

	mine() {

	}
}
class Game {
	constructor() {
		this.code = randomCode()
		this.tanks = []
		this.powerups = []
		this.mapI = -1
		this.map = ''
		this.screen = ''
		this.tanksAlive = 0
		this.winner = ''
	}

	setupTanks() {
		var takenSpawns = []
		this.tanksAlive = this.tanks.length
		this.winner = ''
		for (var i = 0; i < this.tanks.length; i++) {
			var tank = this.tanks[i]
			var spawnI = Math.floor(randomRange(0, maxTankCount))
			while (takenSpawns.includes(spawnI)) {
				spawnI = Math.floor(randomRange(0, maxTankCount))
			}
			takenSpawns.push(spawnI)
			tank.reset()
			tank.x = allMapSpawns[this.mapI][spawnI][0]
			tank.y = allMapSpawns[this.mapI][spawnI][1]
		}
	}

	setupPowerups() {
		this.powerups = []

		var map = maps[this.mapI]
		for (var y = 0; y < map.length; y++) {
			for (var x = 0; x < map[y].length; x++) {
				var blockCode = map[y][x];
				if (blockCode >= 2 && blockCode <= 5) {
					this.powerups.push(new Powerup(x, y, blockCode))
				}
			}
		}
	}

	setup() {
		this.setupTanks()
		this.setupPowerups()
	}

	gameOver() {
		this.screen = 'mapScreen'

		for (var i = 0; i < this.tanks.length; i++) {
			if (this.tanks[i].alive) {
				this.winner = this.tanks[i].name
			}
			this.tanks[i].mapVote = ''
		}
	}
}

// Helper functions
function randomRange(min, max) {
    return Math.random() * (max - min) + min
}

function randomInList(list) {
	return list[Math.floor(Math.random() * list.length)]
}

function randomCode() {
	var code
	do {
		code = ''
		for (var i = 0; i < codeLength; i++) { // Four random lower case letters
			code += String.fromCharCode(randomRange(97, 122 + 1))
		}
	} while (code in games)
	return code
}

function randomPlayerId() {
	var id
	do {
		id = ''
		for (var i = 0; i < playerIdLength; i++) { // Twenty random characters
			id += String.fromCharCode(randomRange(33, 126 + 1))
		}
	} while (id in clients)
	return id
}

function parseMap(mapName, i) {
	var mapMatrix = []
	var mapSpawns = []
	var y = 0
	lineReader.eachLine('maps/' + mapName + '.txt', (line, last) => {
		var line = line.split(' ')
		for (var x = 0; x < line.length; x++) {
			line[x] = parseInt(line[x])
			if (line[x] == 6) {
				mapSpawns.push([x, y])
			}
		}
		mapMatrix.push(line)
		if (last) {
			maps[i] = mapMatrix
			allMapSpawns.push(mapSpawns)
		}
		y += 1
	})
}

function parseAllMaps() {
	for (var i = 0; i < mapNames.length; i++) {
		parseMap(mapNames[i], i)
	}
}
parseAllMaps()

function validateClient(client, playerId) {
	return client == clients[playerId]
}

function getPlayerI(playerId, gameCode) {
	var playerI = -1
	var playerIds = gamePlayerIds[gameCode]
	for (var i = 0; i < playerIds.length; i++) {
		if (playerId == playerIds[i]) {
			playerI = i
			break
		}
	}
	return playerI
}


// Game logic
function calculateBarrelAngle(tank) {
	var dx = tank.controlState.mouseX - (tank.x + 0.5)
	var dy = tank.controlState.mouseY - (tank.y + 0.5)
	tank.angleBarrel = Math.atan(dy / dx) / 3.141592 * 180
	if (dx < 0) {
		tank.angleBarrel += 180
	}
}

function tankWallCollision(mapI, oldX, oldY, dX, dY) {
	var newX = oldX + dX
	var newY = oldY + dY

	var tlWall = maps[mapI][Math.floor(newY)][Math.floor(newX)] == 1
	var trWall = maps[mapI][Math.floor(newY)][Math.floor(newX+1)] == 1
	var blWall = maps[mapI][Math.floor(newY+1)][Math.floor(newX)] == 1
	var brWall = maps[mapI][Math.floor(newY+1)][Math.floor(newX+1)] == 1

	var eitherT = (oldY > Math.floor(newY+1)) && (tlWall || trWall) && !(blWall ||brWall)
	var eitherB = (oldY < Math.floor(newY)) && (blWall || brWall) && !(tlWall || trWall)
	var eitherL = (oldX > Math.floor(newX+1)) && (tlWall || blWall) && !(trWall || brWall)
	var eitherR = (oldX < Math.floor(newX)) && (trWall || brWall) && !(tlWall || blWall)

	var corner = (tlWall && brWall) || (trWall && blWall)

	if (corner) {
		return Collision.both
	}
	else if (eitherT || eitherB) {
		return Collision.horizontal
	}
	else if (eitherL || eitherR) {
		return Collision.vertical
	}
	else {
		return Collision.none
	}

	return Collision.none
}

function shotWallCollision(mapI, oldX, oldY, dx, dy) {
	var newXFloor = Math.floor(oldX + dx + 0.5)
	var newYFloor = Math.floor(oldY + dy + 0.5)

	var xMax = maps[mapI][0].length - 1
	var yMax = maps[mapI].length - 1

	if (newXFloor < 0) {
		xFloor = 0
	} else if (newXFloor > xMax) {
		newXFloor = xMax
	} if (newYFloor < 0) {
		newYFloor = 0
	} else if (newYFloor > yMax) {
		newYFloor = yMax
	}

	if (maps[mapI][newYFloor][newXFloor] != 1) {
		return Collision.none
	}
	else {
		var oldYFloor = Math.floor(oldY + 0.5)
		if (maps[mapI][oldYFloor][newXFloor] != 1) {
			return Collision.horizontal
		}
		else {
			return Collision.vertical
		}
	}
}

function shotTankCollision(mapI, shotX, shotY, tanks) {
	for (var i = 0; i < tanks.length; i++) {
		var tank = tanks[i]

		var dx = shotX - tank.x
		var dy = shotY - tank.y
		var distanceToTank = Math.sqrt(dx * dx + dy * dy)

		if (distanceToTank <= tankShotHitRadius) {
			tank.alive = false
			return true
		}
	}

	return false
}

// Send message
function sendGameToPlayer(game, client) {
	if (client.readyState === WebSocket.OPEN) {
		client.send(JSON.stringify({'gameData': game}))
	}
}

function sendGameToPlayers(game) {
	for (var i = 0; i < game.tanks.length; i++) {
		var playerId = gamePlayerIds[game.code][i]
		var client = clients[playerId]
		if (client.readyState === WebSocket.OPEN) {
			client.send(JSON.stringify({'gameData': game}))
		}
	}
}

function sendMapsToPlayer(client) {
	if (client.readyState === WebSocket.OPEN) {
		client.send(JSON.stringify({'mapData': maps}))
	}
}

function sendPlayerNumber(client, playerNumber) {
	if (client.readyState === WebSocket.OPEN) {
		client.send(JSON.stringify({'playerNumber': playerNumber}))
	}
}

var server = app.listen(port, () => {
	console.log(`HTTP server running on http://localhost:${port}`)
})

const wss = new WebSocket.Server({ server: server })

// Receive message
wss.on('connection', function connection(newClient) {
	// Remember the client
	var newPlayerId = randomPlayerId()
	clients[newPlayerId] = newClient

	// Send the client the maps
	sendMapsToPlayer(newClient)

	// Receive a message from the client
	newClient.on('message', function incoming(data) {
		data = JSON.parse(data)

		if ('hostGame' in data) {
			if (Object.keys(games).length < maxGameCount) {
				// Start game
				var newGame = new Game()
				games[newGame.code] = newGame

				// Add player to game
				newGame.tanks.push(new Tank(data.name, data.color))
				gamePlayerIds[newGame.code] = [newPlayerId]
				sendPlayerNumber(newClient, 0)
				sendGameToPlayer(newGame, newClient)
			}
			else {
				newClient.send(JSON.stringify({'error': 'Reached the max amount of games'}))
			}
		}

		else if ('joinGame' in data) {
			if (data.joinGame in games) {
				// Find game
				var game = games[data.joinGame]

				// Add player to game if slot is available
				var playerAlreadyJoined = false
				var playerIds = gamePlayerIds[game.code]
				for (var i = 0; i < game.tanks.length; i++) {
					if (newPlayerId == playerIds[i]) {
						playerAlreadyJoined = true;
					}
				}

				// Update player lists for everyone
				if (!playerAlreadyJoined && Object.keys(game.tanks).length < maxTankCount) {
					game.tanks.push(new Tank(data.name, data.color))
					gamePlayerIds[game.code].push(newPlayerId)
					var playerNumber = game.tanks.length - 1

					sendPlayerNumber(newClient, playerNumber)
					sendGameToPlayers(game)
				}
			}
			else {
				newClient.send(JSON.stringify({'error': 'Game code is invalid: ' + data.joinGame}))
			}
		}

		else if ('startGame' in data) {
			if (data.startGame in games) {
				// Find game
				games[data.startGame].screen = 'mapScreen'
				sendGameToPlayers(games[data.startGame])
			}
			else {
				newClient.send(JSON.stringify({'error': 'Game code is invalid: ' + data.startGame}))
			}
		}

		else if ('mapVote' in data) {
			if (data.code in games) {
				// Find game
				var game = games[data.code]

				if (game.screen == 'mapScreen') {
					// Find player in game
					var playerI = getPlayerI(newPlayerId, game.code)

					// Set the player vote
					if (playerI >= 0) {
						game.tanks[playerI].mapVote = data.mapVote

						// Count up the votes
						var voteCount = 0
						var votes = Array(mapNames.length).fill(0)
						for (var i = 0; i < game.tanks.length; i++) {
							var vote = game.tanks[i].mapVote
							if (vote) {
								for (var j = 0; j < mapNames.length; j++) {
									if (vote == mapNames[j]) {
										votes[j] += 1
										voteCount += 1
										break
									}
								}
							}
						}

						// Pick the map
						if (voteCount == game.tanks.length) {
							// Find the highest voted map
							var max = 0
							for (var i = 0; i < votes.length; i++) {
								if (votes[i] > max) {
									max = votes[i]
								}
							}

							// Tiebreaker
							var bestPicks = []
							for (var i = 0; i < votes.length; i++) {
								if (votes[i] == max) {
									bestPicks.push(i)
								}
							}
							var randomBest = randomInList(bestPicks)

							game.map = mapNames[randomBest]
							game.mapI = randomBest
							game.screen = 'gameScreen'
							game.setup()
						}

						sendGameToPlayers(game)
					}
					else {
						newClient.send(JSON.stringify({'error': 'Player not is not part of game: ' + data.code}))
					}
				}
				else {
					newClient.send(JSON.stringify({'error': 'Game is currently in progress: ' + data.code}))
				}
			}
			else {
				newClient.send(JSON.stringify({'error': 'Game code is invalid: ' + data.code}))
			}
		}

		else if ('controlState' in data) {
			if (data.code in games) {
				// Find game
				var game = games[data.code]

				if (game.screen == 'gameScreen') {
					// Find player in game
					var playerI = getPlayerI(newPlayerId, game.code)

					// Set the tank control state
					if (playerI >= 0) {
						var tank = game.tanks[playerI]
						tank.controlState = data.controlState

						// Shoot or drop mine
						if (tank.controlState.leftClick) {
							tank.shoot()
						}
						if (tank.controlState.rightClick) {
							tank.mine()
						}
					}
					else {
						newClient.send(JSON.stringify({'error': 'Player not is not part of game: ' + data.code}))
					}
				}
				else {
					newClient.send(JSON.stringify({'error': 'Game is not in progress: ' + data.code}))
				}
			}
			else {
				newClient.send(JSON.stringify({'error': 'Game code is invalid: ' + data.code}))
			}
		}
	})
})

function updateGames() {
	for (var [code, game] of Object.entries(games)) {
		if (game.screen == 'gameScreen') {

			for (var tankI = 0; tankI < game.tanks.length; tankI++) {
				var tank = game.tanks[tankI]

				// Move tank
				if (tank.controlState.left) {
					tank.angleBody -= tankRotateSpeed
					if (tank.angleBody < 0) {
						tank.angleBody += 360
					}
					else if (tank.angleBody > 360) {
						tank.angleBody -= 360
					}
				}
				else if (tank.controlState.right) {
					tank.angleBody += tankRotateSpeed
					if (tank.angleBody < 0) {
						tank.angleBody += 360
					}
					else if (tank.angleBody > 360) {
						tank.angleBody -= 360
					}
				}
				if (tank.controlState.up || tank.controlState.down) {
					dx = tankSpeed * Math.cos(tank.angleBody / 180 * 3.141592)
					dy = tankSpeed * Math.sin(tank.angleBody / 180 * 3.141592)
					if (tank.controlState.down) {
						dx = -dx
						dy = -dy
					}
					var collisionType = tankWallCollision(game.mapI, tank.x, tank.y, dx, dy)
					if (collisionType == Collision.none) {
						tank.x += dx
						tank.y += dy
					}
					else if (collisionType == Collision.horizontal) {
						tank.x += dx
					}
					else if (collisionType == Collision.vertical) {
						tank.y += dy
					}
				}
				calculateBarrelAngle(tank)

				// Move shots
				for (var shotI = 0; shotI < tank.shots.length; shotI++) {
					var shot = tank.shots[shotI]

					if (shot.alive) {
						var wallCollision = shotWallCollision(game.mapI, shot.x, shot.y, shot.dx, shot.dy)
						var tankCollision = shotTankCollision(game.mapI, shot.x+shot.dx, shot.y+shot.dy, game.tanks)

						if (tankCollision == true) {
							shot.alive = false
							game.tanksAlive -= 1
							if (game.tanksAlive == 1) {
								game.gameOver()
							}
						}
						else if (wallCollision == Collision.none) {
							shot.x += shot.dx
							shot.y += shot.dy
						}
						else {
							// First wall: bounce
							if (!shot.bounced) {
								shot.bounced = true
								if (wallCollision == Collision.vertical) {
									shot.dx = -shot.dx
								}
								else if (wallCollision == Collision.horizontal) {
									shot.dy = -shot.dy
								}
							}
							// Second wall: explode
							else {
								shot.alive = false
							}
						}
					}
				}
			}

			sendGameToPlayers(game)
		}
	}
}
setInterval(updateGames, tick)