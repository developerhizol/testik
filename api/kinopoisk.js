const KINOPOISK_API_KEY = '8506349a-691f-4bda-81f8-a9265f2ac227';

const TMDB_API_KEYS = [
    'fb7bb23f03b6994dafc674c074d01761',
    'e55425032d3d0f371fc776f302e7c09b',
    '8301a21598f8b45668d5711a814f01f6',
    '8cf43ad9c085135b9479ad5cf6bbcbda',
    'da63548086e399ffc910fbc08526df05',
    '13e53ff644a8bd4ba37b3e1044ad24f3',
    '269890f657dddf4635473cf4cf456576',
    'a2f888b27315e62e471b2d587048f32e',
    '8476a7ab80ad76f0936744df0430e67c',
    '5622cafbfe8f8cfe358a29c53e19bba0',
    'ae4bd1b6fce2a5648671bfc171d15ba4',
    '257654f35e3dff105574f97fb4b97035',
    '2f4038e83265214a0dcd6ec2eb3276f5',
    '9e43f45f94705cc8e1d5a0400d19a7b7',
    'af6887753365e14160254ac7f4345dd2',
    '06f10fc8741a672af455421c239a1ffc',
    '09ad8ace66eec34302943272db0e8d2c'
];

const ALLOWED_ORIGINS = [
    'https://prokino.live'
];

async function fetchTmdb(url) {
    for (const key of TMDB_API_KEYS) {
        try {
            let urlWithKey;
            if (url.includes('?')) {
                urlWithKey = `${url}&api_key=${key}`;
            } else {
                urlWithKey = `${url}?api_key=${key}`;
            }
            const response = await fetch(urlWithKey);
            if (response.ok) {
                return await response.json();
            }
        } catch (e) {
            console.warn(`TMDB key failed: ${key.substring(0, 10)}...`);
        }
    }
    return null;
}

async function fetchKinopoisk(endpoint) {
    try {
        const response = await fetch(`https://kinopoiskapiunofficial.tech/api/${endpoint}`, {
            headers: { 
                'X-API-KEY': KINOPOISK_API_KEY,
                'Content-Type': 'application/json'
            }
        });
        if (response.ok) {
            return await response.json();
        }
    } catch (e) {
        console.warn('Kinopoisk fetch error:', e);
    }
    return null;
}

module.exports = async (req, res) => {
    const origin = req.headers.origin;
    
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (req.query.image) {
        const imageUrl = `https://image.tmdb.org/t/p/original${req.query.image}`;
        
        try {
            const response = await fetch(imageUrl);
            const buffer = await response.arrayBuffer();
            res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
            res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
            return res.status(200).send(Buffer.from(buffer));
        } catch (err) {
            return res.status(500).json({ error: 'Image proxy error' });
        }
    }

    if (req.query.media === 'images' && req.query.tmdb) {
        const tmdbEndpoint = req.query.tmdb;
        let tmdbUrl = `https://api.themoviedb.org/3${tmdbEndpoint}`;
        
        if (!tmdbUrl.includes('include_image_language=')) {
            tmdbUrl += (tmdbUrl.includes('?') ? '&' : '?') + 'include_image_language=ru,en,null';
        }
        
        const data = await fetchTmdb(tmdbUrl);
        if (data) {
            res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
            return res.status(200).json(data);
        }
        return res.status(500).json({ error: 'Media images fetch failed' });
    }

    if (req.query.tmdb) {
        let tmdbEndpoint = req.query.tmdb;
        const isImagesRequest = tmdbEndpoint.includes('/images');
        
        if (isImagesRequest) {
            if (!tmdbEndpoint.includes('include_image_language=')) {
                tmdbEndpoint += (tmdbEndpoint.includes('?') ? '&' : '?') + 'include_image_language=ru,en,null';
            }
        } else {
            if (!tmdbEndpoint.includes('language=')) {
                tmdbEndpoint += (tmdbEndpoint.includes('?') ? '&' : '?') + 'language=ru-RU';
            }
        }
        
        const tmdbUrl = `https://api.themoviedb.org/3${tmdbEndpoint}`;
        const data = await fetchTmdb(tmdbUrl);
        
        if (data) {
            res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
            return res.status(200).json(data);
        }
        return res.status(500).json({ error: 'All TMDB keys failed' });
    }

    if (req.query.kinopoisk) {
        const data = await fetchKinopoisk(req.query.kinopoisk);
        if (data) {
            return res.status(200).json(data);
        }
        return res.status(500).json({ error: 'Kinopoisk API error' });
    }

    if (req.query.search) {
        const keyword = encodeURIComponent(req.query.search);
        const year = req.query.year ? `&year=${req.query.year}` : '';
        const data = await fetchKinopoisk(`v2.1/films/search-by-keyword?keyword=${keyword}${year}`);
        if (data) {
            return res.status(200).json(data);
        }
        return res.status(500).json({ error: 'Search error' });
    }

    return res.status(400).json({ error: 'Missing parameter' });
};
