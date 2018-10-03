const mb = require('musicbrainz')
const fcsv = require('fast-csv')
const {
	playlists
} = require('./spotify/Playlist-mod')
const library = require('./spotify/YourLibrary-mod')
const bands = require('./bands')
const {
	promisify
} = require('util')

async function collectSpotifyPlaylist() {
	const artistCount = playlists.reduce((artists, p) => {
		p.tracks.forEach(({
			artistName
		}) => {
			artists[artistName] = artists[artistName] ? artists[artistName] + 1 : 1;
		})
		return artists
	}, {})
	Object.entries(artistCount)
		.sort((a, b) => b[1] - a[1])
		.forEach(([name, count]) => console.log(`"${name}",${count}`))
}

async function collectSpotifyLibrary() {
	const trackCount = library.tracks.reduce((artists, track) => {
		artists[track.artist] = artists[track.artist] ? artists[track.artist] + 1 : 1;
		return artists
	}, {})
	// An album counts as 10
	const totalCount = library.tracks.reduce((artists, album) => {
		artists[album.artist] = artists[album.artist] ? artists[album.artist] + 10 : 10;
		return artists
	}, trackCount)

	Object.entries(totalCount)
		.sort((a, b) => b[1] - a[1])
		.forEach(([name, count]) => console.log(`"${name}",${count}`))

}

async function matchToMusicBrainz() {
	let done = 0
	const promises = bands.map(async (b) => {
		try {
			const [first] = await searchArtists(b)
			done += 1
			console.error(`${done}/${bands.length}`)
			return {
				id: first.id,
				name: first.name,
				country: first.country,
				lifespan: [first.lifeSpan.begin, first.lifeSpan.end]
			}
		} catch (e) {
			console.error(e)
		}

	})
	const results = await Promise.all(promises)
	results.forEach(r => {
		console.log(`"${r.id}","${r.name}","${r.country}","${r.lifespan[0]} ${r.lifespan[1]}"`)
	})
}

async function getMusicBrainzAlbums() {
	let done = 0;
	fcsv.fromPath('./musicbrainzID.csv', {
		headers: ['id', 'name', 'country', 'lifespan']
	}).on('data', async ({
		id
	}) => {
		const artist = await lookupArtist(id, ['release-groups'])
		const albums = artist.releaseGroups.filter(r => r.type == 'Album')
		albums.forEach(a =>{
			// album, album name, first release date, artist
			console.log(`"${a.id}","${a.title}","${a.firstReleaseDate || ''}","${id}"`)
		})
		done += 1
		console.error(`${done}/192`)
	})
}


(async () => {
	// await collectSpotifyPlaylist()
	// await collectSpotifyLibrary()
	// await matchToMusicBrainz()
	await getMusicBrainzAlbums()
})()

function searchArtists(query, filter, force) {
	return new Promise((resolve, reject) => {
		mb.searchArtists(query, filter, force, (err, data) => {
			if (err) return reject(err)
			return resolve(data)
		})
	})
}

function load(ent, query, force) {
	return new Promise((resolve, reject) => {
		ent.load(query, force, (err) => {
			if (err) return reject(err)
			return resolve(ent)
		})
	})
}

function lookupArtist(id, links) {
	return new Promise((resolve, reject) => {
		mb.lookupArtist(id, links, (err, data) => {
			if (err) return reject(err)
			return resolve(data)
		})
	})
}