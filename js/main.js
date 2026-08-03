const API_BASE = '/api/kinopoisk';
let bookmarks = JSON.parse(localStorage.getItem('kkpoisk_bookmarks') || '[]');
let currentTrend = 'day';
let searchTimeout = null;
let mainSwiper = null;

const trendingGrid = document.getElementById('trendingGrid');
const nowPlayingGrid = document.getElementById('nowPlayingGrid');
const topRatedGrid = document.getElementById('topRatedGrid');
const upcomingGrid = document.getElementById('upcomingGrid');
const searchInput = document.getElementById('searchInput');
const bookmarksBtn = document.getElementById('bookmarksBtn');
const bookmarksModal = document.getElementById('bookmarksModal');
const closeModal = document.getElementById('closeModal');
const bookmarksList = document.getElementById('bookmarksList');
const bookmarksCountSpan = document.getElementById('bookmarksCount');
const sliderWrapper = document.getElementById('sliderWrapper');

const logoCache = {};

function showToast(message) {
    const toast = document.getElementById('bookmarkToast');
    const toastMessage = document.getElementById('toastMessage');
    toastMessage.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}

function openMovie(tmdbId, type) {
    window.location.href = `/${type}/${tmdbId}`;
}

function openPerson(personId, name) {
    const slug = createSlugForPerson(name);
    window.location.href = `/person/${slug}-${personId}`;
}

function createSlugForPerson(text) {
    if (!text) return 'actor';
    const map = {'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'};
    let slug = text.toLowerCase().split('').map(c => map[c] || c).join('');
    slug = slug.replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return slug;
}

function updateBookmarksCount() { bookmarksCountSpan.textContent = bookmarks.length; }
function saveBookmarks() { localStorage.setItem('kkpoisk_bookmarks', JSON.stringify(bookmarks)); updateBookmarksCount(); }
function isBookmarked(tmdbId) { return bookmarks.some(b => b.tmdbId == tmdbId); }

function toggleBookmark(item, event) {
    if (event) event.stopPropagation();
    const index = bookmarks.findIndex(b => b.tmdbId == item.tmdbId);
    const btns = document.querySelectorAll(`.card-bookmark[data-id="${item.tmdbId}"], .slider_movie-fav[data-id="${item.tmdbId}"]`);
    const title = item.title || 'Фильм';
    
    if (index === -1) {
        bookmarks.push({ 
            tmdbId: item.tmdbId, 
            title: title, 
            year: item.year, 
            posterPath: item.posterPath, 
            type: item.type 
        });
        btns.forEach(btn => btn.classList.add('active'));
        showToast(`«${title}» добавлен в закладки`);
    } else {
        bookmarks.splice(index, 1);
        btns.forEach(btn => btn.classList.remove('active'));
        showToast(`«${title}» удалён из закладок`);
    }
    saveBookmarks();
    renderBookmarksModal();
}

function renderBookmarksModal() {
    if (bookmarks.length === 0) { 
        bookmarksList.innerHTML = '<div style="text-align: center; color: #666; padding: 40px;"><i class="fas fa-inbox"></i> Нет сохранённых фильмов</div>'; 
        return; 
    }
    bookmarksList.innerHTML = bookmarks.map(item => {
        let posterHtml = '';
        if (item.posterPath) {
            const posterUrl = `${API_BASE}?image=${encodeURIComponent(item.posterPath)}`;
            posterHtml = `<img class="bookmark-poster" src="${posterUrl}" onerror="this.onerror=null; this.parentElement.innerHTML = '<div class=\\'bookmark-poster no-image-placeholder\\'><i class=\\'fas fa-image\\'></i></div>'">`;
        } else {
            posterHtml = `<div class="bookmark-poster no-image-placeholder"><i class="fas fa-image"></i></div>`;
        }
        return `<div class="bookmark-item" onclick="openMovie(${item.tmdbId}, '${item.type || 'movie'}')">
            ${posterHtml}
            <div class="bookmark-info">
                <div class="bookmark-title">${escapeHtml(item.title)}</div>
                <div class="bookmark-year">${item.year || '—'} • ${item.type === 'tv' ? 'Сериал' : 'Фильм'}</div>
            </div>
            <button class="remove-bookmark" onclick="event.stopPropagation(); toggleBookmark({tmdbId: ${item.tmdbId}, title: '${escapeHtml(item.title)}', year: '${item.year}', posterPath: '${item.posterPath}', type: '${item.type}'}, event)">
                <i class="fas fa-trash-alt"></i>
            </button>
        </div>`;
    }).join('');
}

function renderMovies(grid, movies) {
    if (!movies || movies.length === 0) { 
        grid.innerHTML = '<div style="text-align: center; color: #666; padding: 40px;"><i class="fas fa-search"></i> Ничего не найдено</div>'; 
        return; 
    }
    grid.innerHTML = movies.map(m => {
        // Определяем тип контента
        const mediaType = m.media_type;
        const isPerson = mediaType === 'person';
        const isMovie = mediaType === 'movie' || (!mediaType && m.title);
        const isTv = mediaType === 'tv' || (!mediaType && m.name);
        
        const type = isMovie ? 'movie' : (isTv ? 'tv' : null);
        const title = m.title || m.name || 'Без названия';
        const year = (m.release_date || m.first_air_date || '').split('-')[0];
        const rating = m.vote_average ? m.vote_average.toFixed(1) : null;
        const bookmarked = !isPerson && isBookmarked(m.id);
        
        // Для актёров используем profile_path, для фильмов/сериалов - poster_path
        const imagePath = isPerson ? m.profile_path : m.poster_path;
        const personId = m.id;
        const personName = m.name;
        
        // Для актёров не показываем кнопку закладок и рейтинг
        if (isPerson) {
            let posterHtml = '';
            if (imagePath) {
                const imageUrl = `${API_BASE}?image=${encodeURIComponent(imagePath)}`;
                posterHtml = `<img src="${imageUrl}" alt="${escapeHtml(title)}" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML = '<div class=\\'no-image-placeholder\\' style=\\'width:100%;height:100%;\\'><i class=\\'fas fa-user\\'></i></div>'">`;
            } else {
                posterHtml = `<div class="no-image-placeholder" style="width:100%;height:100%;"><i class="fas fa-user"></i></div>`;
            }
            
            return `<div class="movie-card" onclick="openPerson(${personId}, '${escapeHtml(personName)}')">
                <div class="movie-poster">
                    ${posterHtml}
                </div>
                <div class="movie-info">
                    <div class="movie-title">${escapeHtml(title)}</div>
                    <div class="movie-year" style="color:#888; font-size:10px;">Актёр</div>
                </div>
            </div>`;
        }
        
        // Для фильмов и сериалов - используем иконку fa-image
        let posterHtml = '';
        if (imagePath) {
            const imageUrl = `${API_BASE}?image=${encodeURIComponent(imagePath)}`;
            posterHtml = `<img src="${imageUrl}" alt="${escapeHtml(title)}" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML = '<div class=\\'no-image-placeholder\\' style=\\'width:100%;height:100%;\\'><i class=\\'fas fa-image\\'></i></div>'">`;
        } else {
            posterHtml = `<div class="no-image-placeholder" style="width:100%;height:100%;"><i class="fas fa-image"></i></div>`;
        }
        
        return `<div class="movie-card" onclick="openMovie(${m.id}, '${type}')">
            <div class="movie-poster">
                ${posterHtml}
                ${rating ? `<div class="movie-rating">${rating}</div>` : ''}
                <button class="card-bookmark ${bookmarked ? 'active' : ''}" data-id="${m.id}" onclick="event.stopPropagation(); toggleBookmark({tmdbId: ${m.id}, title: '${escapeHtml(title)}', year: '${year || ''}', posterPath: '${imagePath || ''}', type: '${type}'}, event)"><i class="fas fa-bookmark"></i></button>
            </div>
            <div class="movie-info"><div class="movie-title">${escapeHtml(title)}</div></div>
        </div>`;
    }).join('');
}

async function loadTrending() {
    trendingGrid.innerHTML = '<div class="loading"><div class="spinner"></div>Загрузка...</div>';
    try {
        const res = await fetch(`${API_BASE}?tmdb=/trending/all/${currentTrend}?language=ru-RU`);
        if (res.ok) { 
            const data = await res.json(); 
            // Фильтруем актёров из трендов (показываем только фильмы и сериалы)
            const filtered = (data.results || []).filter(m => m.media_type !== 'person');
            renderMovies(trendingGrid, filtered); 
        } else { 
            trendingGrid.innerHTML = '<div style="text-align: center; color: #666; padding: 40px;">Ошибка загрузки</div>'; 
        }
    } catch(e) { 
        trendingGrid.innerHTML = '<div style="text-align: center; color: #666; padding: 40px;">Ошибка загрузки</div>'; 
    }
}

async function loadNowPlaying() {
    nowPlayingGrid.innerHTML = '<div class="loading"><div class="spinner"></div>Загрузка...</div>';
    try {
        const res = await fetch(`${API_BASE}?tmdb=/movie/now_playing?language=ru-RU`);
        if (res.ok) { 
            const data = await res.json(); 
            renderMovies(nowPlayingGrid, data.results || []); 
        } else { 
            nowPlayingGrid.innerHTML = '<div style="text-align: center; color: #666; padding: 40px;">Ошибка загрузки</div>'; 
        }
    } catch(e) { 
        nowPlayingGrid.innerHTML = '<div style="text-align: center; color: #666; padding: 40px;">Ошибка загрузки</div>'; 
    }
}

async function loadTopRated() {
    topRatedGrid.innerHTML = '<div class="loading"><div class="spinner"></div>Загрузка...</div>';
    try {
        const res = await fetch(`${API_BASE}?tmdb=/movie/top_rated?language=ru-RU`);
        if (res.ok) { 
            const data = await res.json(); 
            renderMovies(topRatedGrid, data.results || []); 
        } else { 
            topRatedGrid.innerHTML = '<div style="text-align: center; color: #666; padding: 40px;">Ошибка загрузки</div>'; 
        }
    } catch(e) { 
        topRatedGrid.innerHTML = '<div style="text-align: center; color: #666; padding: 40px;">Ошибка загрузки</div>'; 
    }
}

async function loadUpcoming() {
    upcomingGrid.innerHTML = '<div class="loading"><div class="spinner"></div>Загрузка...</div>';
    try {
        const res = await fetch(`${API_BASE}?tmdb=/movie/upcoming?language=ru-RU`);
        if (res.ok) { 
            const data = await res.json(); 
            renderMovies(upcomingGrid, data.results || []); 
        } else { 
            upcomingGrid.innerHTML = '<div style="text-align: center; color: #666; padding: 40px;">Ошибка загрузки</div>'; 
        }
    } catch(e) { 
        upcomingGrid.innerHTML = '<div style="text-align: center; color: #666; padding: 40px;">Ошибка загрузки</div>'; 
    }
}

async function getMovieLogo(tmdbId, type, title) {
    const cacheKey = `${type}_${tmdbId}`;
    if (logoCache[cacheKey] !== undefined) return logoCache[cacheKey];
    
    try {
        const res = await fetch(`${API_BASE}?tmdb=/${type}/${tmdbId}/images?include_image_language=ru,en,null`);
        if (!res.ok) return null;
        const data = await res.json();
        const logos = data.logos || [];
        
        const ruLogo = logos.find(l => l.iso_639_1 === 'ru');
        const enLogo = logos.find(l => l.iso_639_1 === 'en');
        const logo = ruLogo || enLogo;
        
        if (logo) {
            const logoUrl = `${API_BASE}?image=${encodeURIComponent(logo.file_path)}`;
            logoCache[cacheKey] = logoUrl;
            return logoUrl;
        }
    } catch(e) {}
    logoCache[cacheKey] = null;
    return null;
}

async function loadSlider() {
    try {
        const res = await fetch(`${API_BASE}?tmdb=/trending/all/week?language=ru-RU`);
        if (!res.ok) return;
        const data = await res.json();
        const movies = (data.results || []).filter(m => m.media_type !== 'person').slice(0, 8);
        
        sliderWrapper.innerHTML = movies.map(m => {
            const poster = m.poster_path;
            const backdrop = m.backdrop_path || m.poster_path;
            const title = m.title || m.name || 'Без названия';
            const year = (m.release_date || m.first_air_date || '').split('-')[0];
            const rating = m.vote_average ? m.vote_average.toFixed(1) : null;
            const type = m.media_type === 'tv' ? 'tv' : 'movie';
            const bookmarked = isBookmarked(m.id);
            const overview = m.overview ? (m.overview.length > 120 ? m.overview.substring(0, 120) + '...' : m.overview) : '';
            const tmdbId = m.id;
            
            let backdropHtml = '';
            if (backdrop) {
                const backdropUrl = `${API_BASE}?image=${encodeURIComponent(backdrop)}`;
                backdropHtml = `<img src="${backdropUrl}" alt="${escapeHtml(title)}" onerror="this.onerror=null; this.parentElement.style.background='#1a1a1a'; this.parentElement.innerHTML='<div class=\\'no-image-placeholder\\' style=\\'width:100%;height:100%;\\'><i class=\\'fas fa-image\\'></i></div>'">`;
            } else {
                backdropHtml = `<div class="no-image-placeholder" style="width:100%;height:100%;"><i class="fas fa-image"></i></div>`;
            }
            
            return `<div class="swiper-slide" data-tmdb-id="${tmdbId}" data-type="${type}">
                <div class="slider_movie-main">
                    <div class="slider_movie-poster">
                        ${backdropHtml}
                    </div>
                    <div class="slider_movie-content">
                        <div class="slider-logo-container" id="logo-${tmdbId}">
                            <a href="/${type}/${tmdbId}" class="slider_movie-title">${escapeHtml(title)}</a>
                        </div>
                        <div class="slider_movie-tags">
                            ${rating ? `<span class="slider_movie-tags_rating">★ ${rating}</span>` : ''}
                            ${year ? `<span>${year}</span>` : ''}
                            <span>${type === 'tv' ? 'Сериал' : 'Фильм'}</span>
                        </div>
                        <p class="slider_movie-description">${overview}</p>
                        <div class="slider_movie-buttons">
                            <a href="/${type}/${tmdbId}" class="slider_movie-btn"><i class="fas fa-play"></i> Смотреть</a>
                            <button class="slider_movie-fav ${bookmarked ? 'active' : ''}" data-id="${tmdbId}" onclick="toggleBookmark({tmdbId: ${tmdbId}, title: '${escapeHtml(title)}', year: '${year || ''}', posterPath: '${poster || ''}', type: '${type}'}, event)">
                                <i class="fas fa-bookmark"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');
        
        for (const m of movies) {
            const type = m.media_type === 'tv' ? 'tv' : 'movie';
            const tmdbId = m.id;
            const title = m.title || m.name || 'Без названия';
            const logoUrl = await getMovieLogo(tmdbId, type, title);
            const logoContainer = document.getElementById(`logo-${tmdbId}`);
            if (logoContainer && logoUrl) {
                logoContainer.innerHTML = `<a href="/${type}/${tmdbId}"><img class="slider_movie-logo" src="${logoUrl}" alt="${escapeHtml(title)}" onerror="this.onerror=null; this.style.display='none'; this.nextElementSibling.style.display='block';"></a><a href="/${type}/${tmdbId}" class="slider_movie-title" style="display: none;">${escapeHtml(title)}</a>`;
            }
        }
        
        if (mainSwiper) mainSwiper.destroy();
        mainSwiper = new Swiper('.main-slider', {
            slidesPerView: 1,
            effect: 'fade',
            fadeEffect: { crossFade: true },
            loop: true,
            autoplay: { delay: 6000, disableOnInteraction: false },
            pagination: { 
                el: '#sliderPagination', 
                clickable: true,
                bulletClass: 'swiper-pagination-bullet',
                bulletActiveClass: 'swiper-pagination-bullet-active',
            },
            navigation: { nextEl: '#sliderNext', prevEl: '#sliderPrev' },
            on: {
                init: function() {
                    document.querySelector('#sliderPagination').style.opacity = '1';
                },
            }
        });
        
        setTimeout(() => {
            const pagination = document.querySelector('#sliderPagination');
            if (pagination) pagination.style.opacity = '1';
        }, 10);
        
    } catch(e) {
        console.error('Slider error:', e);
    }
}

async function searchMovies(query) {
    if (!query.trim()) {
        document.querySelectorAll('.section').forEach(s => s.style.display = '');
        const searchSection = document.getElementById('searchResultsSection');
        if (searchSection) searchSection.remove();
        document.querySelector('.slider_movie').style.display = '';
        return;
    }
    document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
    document.querySelector('.slider_movie').style.display = 'none';
    let searchSection = document.getElementById('searchResultsSection');
    if (!searchSection) {
        searchSection = document.createElement('div');
        searchSection.id = 'searchResultsSection';
        searchSection.className = 'section';
        searchSection.innerHTML = `<div class="section-header"><h2 class="section-title"><i class="fas fa-search"></i> Результаты поиска</h2></div><div class="movies-grid" id="searchResultsGrid"></div>`;
        document.querySelector('.container').insertBefore(searchSection, document.querySelector('.container').firstChild);
    }
    searchSection.style.display = '';
    const searchGrid = document.getElementById('searchResultsGrid');
    searchGrid.innerHTML = '<div class="loading"><div class="spinner"></div>Поиск...</div>';
    try {
        const res = await fetch(`${API_BASE}?tmdb=/search/multi?query=${encodeURIComponent(query)}&language=ru-RU`);
        if (res.ok) { 
            const data = await res.json(); 
            // В поиске оставляем все результаты (включая актёров)
            renderMovies(searchGrid, data.results || []); 
        } else { 
            searchGrid.innerHTML = '<div style="text-align: center; color: #666; padding: 40px;">Ошибка поиска</div>'; 
        }
    } catch(e) { 
        searchGrid.innerHTML = '<div style="text-align: center; color: #666; padding: 40px;">Ошибка поиска</div>'; 
    }
}

function escapeHtml(text) { 
    if (!text) return ''; 
    const div = document.createElement('div'); 
    div.textContent = text; 
    return div.innerHTML; 
}

searchInput.addEventListener('input', (e) => { 
    if (searchTimeout) clearTimeout(searchTimeout); 
    searchTimeout = setTimeout(() => searchMovies(e.target.value), 400); 
});

document.querySelectorAll('.trend-btn').forEach(btn => { 
    btn.addEventListener('click', () => { 
        document.querySelectorAll('.trend-btn').forEach(b => b.classList.remove('active')); 
        btn.classList.add('active'); 
        currentTrend = btn.dataset.trend; 
        loadTrending(); 
    }); 
});

bookmarksBtn.addEventListener('click', () => { 
    renderBookmarksModal(); 
    bookmarksModal.classList.add('active'); 
});
closeModal.addEventListener('click', () => { 
    bookmarksModal.classList.remove('active'); 
});
bookmarksModal.addEventListener('click', (e) => { 
    if (e.target === bookmarksModal) bookmarksModal.classList.remove('active'); 
});

window.addEventListener('scroll', () => { 
    const header = document.getElementById('header'); 
    if (window.scrollY > 50) header.classList.add('scrolled'); 
    else header.classList.remove('scrolled'); 
});

function init() { 
    document.querySelector('#sliderPagination').style.opacity = '1';
    document.querySelector('.slider_movie-indicators').style.opacity = '1';
    loadSlider();
    loadTrending(); 
    loadNowPlaying(); 
    loadTopRated(); 
    loadUpcoming(); 
    updateBookmarksCount(); 
}
init();
