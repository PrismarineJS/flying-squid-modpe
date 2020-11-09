const Vec3 = require("vec3").Vec3
const { readdir, readFile, realpath } = require("fs").promises

function requireFromString(src, filename) {
	const Module = module.constructor
	const m = new Module()
	m._compile(src, filename)
	return m.exports
}

function modpeApi() {
	let Vec3 = null
	let vec3 = null
	let server = null
	let player = null
	module.exports.startDestroyBlock = function startDestroyBlock(x, y, z, side) {}
	module.exports.destroyBlock = function destroyBlock(x, y, z, side) {}
	module.exports.newLevel = function newLevel() {}
	module.exports.procCmd = function procCmd(command) {}
	module.exports.exec = function exec(code) { eval(code) }
	module.exports.modTick = function modTick() {}
	module.exports.useItem = function useItem(x, y, z, itemId, blockId) {}
	module.exports.initSquid = function initSquid(pl1, srv, v3) {
		player = pl1;
		server = srv;
		vec3 = v3;
		Vec3 = v3;
	}
	function clientMessage(message) { player.chat(message) }
	function setTile(x, y, z, id, damage) {
		server.setBlock(server.overworld, new Vec3(x, y, z), id, damage)
	}
	function getTile(x, y, z) { return server.overworld.sync.getBlockType(new Vec3(x, y, z)) }
	function preventDefault() {}
	function getPlayerX() { return player.position.x / 32 }
	function getPlayerY() { return player.position.y / 32 }
	function getPlayerZ() { return player.position.z / 32 }
	function getPlayerEnt() { return null }
	function getCarriedItem() { return player.heldItem.blockId }
	let Player = { getCarriedItem: () => player.heldItem.blockId }
	let Entity = { getPitch: () => 1, getYaw: () => 1 }
	let Level = { getGameMode: () => player.gameMode, getData: (x, y, z) => 0 }
}

function convert(code) {
	return modpeApi.toString().slice("function modpeApi() {".length, -1) + code
}

module.exports.server = async function(srv, { modpe, verbose }) {
	function srvLog (msg) {
		if (verbose) srv.log(`[MPE]: ${msg}`)
	}
	if (!modpe) {
		srvLog("Modpe support is not enabled, disabling injecting...")
		return
	}
	let world = serv.overworld
	
	srvLog("Modpe injection start...")
	const modPePluginsDir = await realpath(`${__dirname}/../../../modpePlugins`)
	srvLog(`Place your scripts in: ${modPePluginsDir}`)
	
	const mods = []
	const files = await readdir(modPePluginsDir, { withFileTypes: true })
	for (const file of files.filter(v => (/.js$/).test(v))) {
		const content = convert(await readFile(file, "utf-8"))
		const modname = file.split("/")[file.split("/").length - 1].split(".")[0]
		srvLog(`Loading mod "${modname}" (converted)`)
		try {
			mods.push(requireFromString(content))
		} catch (e) {
			srvLog(`Error loading mod: ${e}`)
		}
	}
	srvLog(`Loaded ${mods.length} mods`)

	serv.on("newPlayer", function injectPlayer(player) {
		srvLog("Injected into player")
		mods.forEach(mod => mod.initSquid(player, serv, Vec3))
		mods.forEach(mod => mod.newLevel())

		player._client.on("block_dig", packet => {
			const { x, y, z } = packet.location
			const side = 0
			if (packet.status === 0 && player.gameMode !== 1) {
				mods.forEach(mod => mod.startDestroyBlock(x, y, z, side))
			} else if (packet.status === 2 && (packet.status === 0 && player.gameMode === 1)) {
				mods.forEach(mod => mod.destroyBlock(x, y, z, side))
			}
			/* (packet.status == 1) -> Unused in ModPE */
		})

		player._client.on("position", () => mods.forEach(mod => mod.modTick()))

		player._client.on("block_place", async (packet) => {
			const { x, y, z } = packet.location
			if (y < 0) return
			const itemId = packet.heldItem.blockId
			const blockId = await world.getBlockType(packet.location)
			for (const mod of mods) {
				mod.useItem(x, y, z, itemId, blockId)
				mod.exec(`lastUsedItem=${itemId}`)
			}
		})

		player.on("modpe", cmd => {
			try {
				mods.forEach(mod => mod.procCmd(cmd))
			} catch (err) {
				srv.emit("error", err)
			}
		})
	})
};
