const mb = require('musicbrainz')
const fcsv = require('fast-csv')
const axios = require('axios')
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
	fcsv.fromPath('./csv/musicbrainzID.csv', {
		headers: ['id', 'name', 'country', 'lifespan']
	}).on('data', async ({
		id
	}) => {
		const artist = await lookupArtist(id, ['release-groups'])
		const albums = artist.releaseGroups.filter(r => r.type == 'Album')
		const promises = albums.map(async (a) => {
			let mainrelease, front, back, stage;
			try {
				stage = 'relgroup'
				const {
					data
				} = await axios.get(`https://coverartarchive.org/release-group/${a.id}/`);
				stage = 'coverart-start';
				mainrelease = (data.release || '').split('/').pop();
				stage = 'coverart-rel';
				front = data.images.find(i => i.front).image
				stage = 'coverart-front';
				back = data.images.find(i => i.back).image
				stage = 'coverart-end';
			} catch (e) {
				console.error(`failed: ${artist.name} - ${a.title} (${stage}) => ${a.id}`)
			} finally {
				switch (stage) {
					case 'coverart-end':
						// artist id, relgroup id, relgroup name, first release date, main release, front cover, back cover
						console.log(`"${id}","${a.id}","${a.title}","${a.firstReleaseDate || ''}","${mainrelease}","${front || ''}","${back || ''}"`)
						break
					case 'coverart-front':
						// artist id, relgroup id, relgroup name, first release date, main release, front cover
						console.log(`"${id}","${a.id}","${a.title}","${a.firstReleaseDate || ''}","${mainrelease}","${front || ''}",""`)
						break
					case 'coverart-rel':
						// artist id, relgroup id, relgroup name, first release date, main release
						console.log(`"${id}","${a.id}","${a.title}","${a.firstReleaseDate || ''}","${mainrelease}","",""`)
						break
					default:
						// artist id, relgroup id, relgroup name, first release date
						console.log(`"${id}","${a.id}","${a.title}","${a.firstReleaseDate || ''}","","",""`)
				}
				done += 1
				console.error(`${done}/192`)
				return Promise.resolve()
			}
		})
		return Promise.all(promises)
	})
}

async function getMusicBrainzSongs() {
	return new Promise((resolve, reject) => {
		let done = 0;
		fcsv.fromPath('./csv/albums-full.csv', {
			headers: ["artist", "relgroup", "relgroup-name", "reldate", "mainrel", "frontcover", "backcover"]
		}).on('data', async ({
			mainrel
		}) => {
			const release = await lookupRelease(mainrel, ['recordings'])
			release.mediums.forEach(m => {
				const format = m.format && m.format['#'] ? m.format['#'] : m.position;
				m.tracks.forEach(t => {
					try {
						// release id, medium, track id, track name, position, length
						console.log(`"${mainrel}","${format.replace(/"/g,"'")}","${t.recording.id}","${t.recording.title}","${t.position}","${t.length}"`)
					} catch (e) {
						console.error(`failed: ${t.recording.id} => ${e.message}`)
					}
				});
			});
			done += 1;
			console.error(`${done}/1858`)
		}).on('end', () => {
			resolve(true)
		})
	})
}

async function getAcousticBrainz() {
	let done = 0;
	const promises = [];
	let row = 0;
	fcsv.fromPath('./csv/tracks.csv', {
		headers: ["release", "medium", "track", "name", "position", "length"]
	}).on('data', async ({
		track
	}) => {
		const elem = (async (currRow) => {
			return new Promise(async (resolve, reject) => {
				try {
					await new Promise((r) => {
						setTimeout(r(), (row % 10) * 100)
					})
					const {
						data
					} = await axios.get(`https://acousticbrainz.org/api/v1/${track}/low-level`)
					const bpm = (data && data.rhythm && data.rhythm.bpm) || "0"
					const loud = (data && data.lowlevel && data.lowlevel.average_loudness) || "0"
					const chordchange = (data && data.tonal && data.tonal.chords_changes_rate) || "0"
					const chordkey = (data && data.tonal && data.tonal.chords_key) || ""
					const chordscale = (data && data.tonal && data.tonal.chords_scale) || ""
					const keykey = (data && data.tonal && data.tonal.key_key) || ""
					const keyscale = (data && data.tonal && data.tonal.key_scale) || ""
					const keystr = (data && data.tonal && data.tonal.key_strength) || "0"
					console.log(`"${track}","${bpm}","${loud}","${chordkey} ${chordscale}","${chordchange}","${keykey} ${keyscale}","${keystr}"`)
					done += 1
					console.error(`${done}/23519`)
					resolve(true)
				} catch (e) {
					console.error(`failed (${row}): ${track} => ${e.message}`)
				}
			})
		})(row)
		promises.push(elem)
		row++
	}).on('end', () => {
		return Promise.all(promises)
	})
}


(async () => {
	// await collectSpotifyPlaylist()
	// await collectSpotifyLibrary()
	// await matchToMusicBrainz()
	// await getMusicBrainzAlbums()
	// await getMusicBrainzSongs()
	await getAcousticBrainz()
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

function lookupRelease(id, links) {
	return new Promise((resolve, reject) => {
		mb.lookupRelease(id, links, (err, data) => {
			if (err) return reject(err)
			return resolve(data)
		})
	})
}