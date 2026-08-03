const API_BASE = '/api/kinopoisk';
const NO_BACKDROP_URL = '/imgs/nobackdrop.jpg';
const AD_IMAGE_URL = '/imgs/subscribe.jpg';

const POSTER_POSITION = {
    vertical: 50,
    horizontal: 50
};

function openImageModal(imageUrl) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    modalImg.src = imageUrl;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeImageModal() {
    const modal = document.getElementById('imageModal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
    setTimeout(() => { document.getElementById('modalImage').src = ''; }, 300);
}

function showToast(message) {
    const toast = document.getElementById('bookmarkToast');
    const toastMessage = document.getElementById('toastMessage');
    toastMessage.textContent = message;
    toast.classList.add('show');
    setTimeout(() => { toast.classList.remove('show'); }, 2000);
}

const ALLOHA_TOKEN = '79e1387cee394b9622b7249a427e78';

const API_CONFIG = {
    alloha: {
        getUrl: (tmdbId, posterPath, season, episode) => {
            let url = `https://supervision-as.stloadi.live/?token=${ALLOHA_TOKEN}&tmdb=${tmdbId}`;
            if (posterPath) {
                const posterUrl = `${window.location.origin}/api/kinopoisk?image=${encodeURIComponent(posterPath)}`;
                url += `&poster=${encodeURIComponent(posterUrl)}`;
            }
            if (season) url += `&season=${season}`;
            if (episode) url += `&episode=${episode}`;
            return url;
        }
    }
};

class MoviePage {
    constructor() {
        this.tmdbId = null;
        this.imdbId = null;
        this.contentType = null;
        this.tmdbData = null;
        this.kinopoiskData = null;
        this.collectionItemsData = [];
        this.similarItemsData = [];
        this.imagesData = { backdrops: [], posters: [], logos: [] };
        this.castData = [];
        this.posterLoaded = false;
        this.loadError = false;
        this.isReleased = true;
        this.releaseDate = null;
        this.isBookmarked = false;
        this.logoUrl = null;
        this.ageRating = null;
        this.isAdult = false;
        this.ageConfirmed = false;
        this.ageModal = null;
        this.posterWithoutLang = null;
        this.bestBackdrop = null;
        
        this.seasonsData = [];
        this.currentSeason = 1;
        this.episodesData = {};
        this.playerModalEscHandler = null;
        this.trailerModalEscHandler = null;
        
        // Рекламный банер
        this.adOverlay = null;
        this.adTimer = null;
        this.adCountdown = 15;
        this.adSkipEnabled = false;
        this.adClosed = false;
        this.adContainerSelector = null;
        this.closeButtonHidden = false;
        this.adParentContainer = null;
        
        this.init();
    }
    
    async init() {
        const urlData = this.parseUrl();
        if (!urlData) { window.location.href = '/'; return; }
        
        this.contentType = urlData.type;
        
        if (urlData.kinopoiskId) {
            const success = await this.getTmdbIdFromKinopoisk(urlData.kinopoiskId);
            if (!success) { this.showError(`Не удалось найти ${this.contentType === 'tv' ? 'сериал' : 'фильм'}`); return; }
        } else if (urlData.tmdbId) {
            this.tmdbId = urlData.tmdbId;
        }
        
        if (!this.tmdbId) { this.showError(`Не указан ID ${this.contentType === 'tv' ? 'сериала' : 'фильма'}`); return; }
        
        await this.loadViaTmdb();
    }
    
    parseUrl() {
        let path = window.location.pathname;
        path = path.replace(/\/$/, '');
        
        let match = path.match(/^\/(movie|tv)\/(?:[a-z0-9-]+-)?(\d+)$/i);
        if (match) return { type: match[1], tmdbId: match[2] };
        
        match = path.match(/^\/(film|series)\/(\d+)$/);
        if (match) return { type: match[1] === 'film' ? 'movie' : 'tv', kinopoiskId: match[2] };
        
        match = path.match(/^\/(movie|tv)\/(\d+)$/i);
        if (match) return { type: match[1], tmdbId: match[2] };
        
        return null;
    }
    
    async getTmdbIdFromKinopoisk(kpId) {
        try {
            const kpResponse = await fetch(`${API_BASE}?kinopoisk=v2.2/films/${kpId}`);
            if (!kpResponse.ok) return false;
            this.kinopoiskData = await kpResponse.json();
            if (!this.kinopoiskData.imdbId) return false;
            this.imdbId = this.kinopoiskData.imdbId;
            
            const findResponse = await fetch(`${API_BASE}?tmdb=/find/${this.imdbId}?external_source=imdb_id`);
            if (!findResponse.ok) return false;
            const findData = await findResponse.json();
            
            let tmdbItem = null;
            if (this.contentType === 'tv') {
                tmdbItem = findData.tv_results?.[0];
            } else {
                tmdbItem = findData.movie_results?.[0];
            }
            if (!tmdbItem) tmdbItem = findData.movie_results?.[0] || findData.tv_results?.[0];
            if (!tmdbItem) return false;
            
            this.tmdbId = tmdbItem.id;
            if (tmdbItem.media_type === 'tv' || findData.tv_results?.some(r => r.id === tmdbItem.id)) {
                this.contentType = 'tv';
            } else {
                this.contentType = 'movie';
            }
            return true;
        } catch (error) { console.error(error); return false; }
    }
    
    async loadViaTmdb() {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) loadingScreen.style.display = 'flex';
        
        try {
            const tmdbResponse = await fetch(`${API_BASE}?tmdb=/${this.contentType}/${this.tmdbId}?language=ru-RU`);
            if (!tmdbResponse.ok) { 
                this.showError(`Не удалось получить данные`); 
                return; 
            }
            this.tmdbData = await tmdbResponse.json();
            if (this.tmdbData.imdb_id) this.imdbId = this.tmdbData.imdb_id;
            this.isAdult = this.tmdbData.adult === true;
            
            await this.loadAgeRating();
            await this.loadImages();
            await this.loadLogo();
            await this.loadCredits();
            await this.loadCollectionAndRecommendations();
            
            if (this.contentType === 'tv') {
                await this.loadSeasonsData();
            }
            
            await this.convertToSlugUrl();
            this.checkReleaseDate();
            this.checkBookmarkStatus();
            
            const movieTitle = this.getMovieTitle();
            const movieYear = this.getMovieYear();
            document.title = `Смотреть ${movieTitle}${movieYear ? ` (${movieYear})` : ''} бесплатно без регистрации`;
            
            this.updateUI();
            await this.setupPoster();
            this.hideLoadingScreen();
            
            if (this.isAdult) {
                setTimeout(() => { this.showAgeModal(); }, 100);
            }
        } catch (error) { 
            console.error(error); 
            this.showError('Произошла ошибка при загрузке.'); 
        }
    }
    
    async loadAgeRating() {
        try {
            const certResponse = await fetch(`${API_BASE}?tmdb=/${this.contentType}/${this.tmdbId}/release_dates`);
            if (certResponse.ok) {
                const certData = await certResponse.json();
                const results = certData.results || [];
                for (const country of results) {
                    if (country.iso_3166_1 === 'RU') {
                        for (const rd of (country.release_dates || [])) {
                            if (rd.certification && rd.certification !== '') {
                                let cert = rd.certification;
                                if (!cert.includes('+')) {
                                    cert = cert.replace(/[^0-9]/g, '');
                                    if (cert && !isNaN(cert)) { this.ageRating = cert + '+'; if (cert === '18') this.isAdult = true; }
                                    else this.ageRating = rd.certification;
                                } else { this.ageRating = cert; if (cert === '18+') this.isAdult = true; }
                                break;
                            }
                        }
                    }
                    if (this.ageRating) break;
                }
                if (!this.ageRating) {
                    for (const country of results) {
                        if (country.iso_3166_1 === 'US') {
                            for (const rd of (country.release_dates || [])) {
                                if (rd.certification && rd.certification !== '') {
                                    let cert = rd.certification;
                                    if (cert === 'R') { this.ageRating = '18+'; this.isAdult = true; }
                                    else if (cert === 'NC-17') { this.ageRating = '18+'; this.isAdult = true; }
                                    else if (cert === 'PG-13') this.ageRating = '13+';
                                    else if (cert === 'PG') this.ageRating = '12+';
                                    else if (cert === 'G') this.ageRating = '0+';
                                    else if (!cert.includes('+')) {
                                        cert = cert.replace(/[^0-9]/g, '');
                                        if (cert && !isNaN(cert)) { this.ageRating = cert + '+'; if (cert === '18') this.isAdult = true; }
                                        else this.ageRating = cert;
                                    } else { this.ageRating = cert; if (cert === '18+') this.isAdult = true; }
                                    break;
                                }
                            }
                        }
                        if (this.ageRating) break;
                    }
                }
            }
        } catch(e) {}
    }
    
    async loadImages() {
        const mediaImagesResponse = await fetch(`${API_BASE}?media=images&tmdb=/${this.contentType}/${this.tmdbId}/images`);
        if (mediaImagesResponse.ok) {
            const imagesData = await mediaImagesResponse.json();
            this.imagesData.backdrops = imagesData.backdrops || [];
            this.imagesData.posters = imagesData.posters || [];
            this.imagesData.logos = imagesData.logos || [];
            
            if (this.imagesData.posters.length > 0) {
                const p = this.imagesData.posters.find(p => p.iso_639_1 === null);
                if (p) this.posterWithoutLang = p.file_path;
            }
            
            if (this.imagesData.backdrops.length > 0) {
                let b = this.imagesData.backdrops.find(b => b.iso_639_1 === null);
                if (!b) b = this.imagesData.backdrops.find(b => b.iso_639_1 === 'ru');
                if (!b) b = this.imagesData.backdrops.find(b => b.iso_639_1 === 'en');
                if (!b) b = this.imagesData.backdrops[0];
                if (b) this.bestBackdrop = b.file_path;
            }
        }
    }
    
    async loadLogo() {
        const heroLogoResponse = await fetch(`${API_BASE}?media=images&tmdb=/${this.contentType}/${this.tmdbId}/images`);
        if (heroLogoResponse.ok) {
            const heroLogoData = await heroLogoResponse.json();
            if (heroLogoData.logos && heroLogoData.logos.length > 0) {
                let selectedLogo = null;
                
                for (const logo of heroLogoData.logos) {
                    if (logo.iso_639_1 === 'ru') {
                        selectedLogo = logo;
                        break;
                    }
                }
                
                if (!selectedLogo) {
                    for (const logo of heroLogoData.logos) {
                        if (logo.iso_639_1 === 'en') {
                            selectedLogo = logo;
                            break;
                        }
                    }
                }
                
                if (selectedLogo) {
                    this.logoUrl = selectedLogo.file_path;
                } else {
                    this.logoUrl = null;
                }
            } else {
                this.logoUrl = null;
            }
        } else {
            this.logoUrl = null;
        }
    }
    
    async loadCredits() {
        const creditsResponse = await fetch(`${API_BASE}?tmdb=/${this.contentType}/${this.tmdbId}/credits?language=ru-RU`);
        if (creditsResponse.ok) {
            const creditsData = await creditsResponse.json();
            this.castData = (creditsData.cast || []).slice(0, 12);
        }
    }
    
    async loadCollectionAndRecommendations() {
        if (this.tmdbData.belongs_to_collection?.id) {
            const collectionResponse = await fetch(`${API_BASE}?tmdb=/collection/${this.tmdbData.belongs_to_collection.id}?language=ru-RU`);
            if (collectionResponse.ok) {
                const collectionData = await collectionResponse.json();
                if (collectionData.parts?.length > 0) {
                    for (const part of collectionData.parts) {
                        let partDetails = null;
                        if (part.first_air_date) {
                            const tvResponse = await fetch(`${API_BASE}?tmdb=/tv/${part.id}?language=ru-RU`);
                            if (tvResponse.ok) partDetails = await tvResponse.json();
                        } else {
                            const movieResponse = await fetch(`${API_BASE}?tmdb=/movie/${part.id}?language=ru-RU`);
                            if (movieResponse.ok) partDetails = await movieResponse.json();
                        }
                        this.collectionItemsData.push({
                            id: part.id,
                            title: part.title || part.name,
                            year: (part.release_date || part.first_air_date || '').split('-')[0],
                            poster_path: part.poster_path,
                            vote_average: part.vote_average,
                            runtime: partDetails?.runtime || null,
                            number_of_seasons: partDetails?.number_of_seasons || null,
                            number_of_episodes: partDetails?.number_of_episodes || null,
                            first_air_date: part.first_air_date || null,
                            release_date: part.release_date || null,
                            name: part.name || null
                        });
                    }
                }
            }
        }
        
        const recommendationsResponse = await fetch(`${API_BASE}?tmdb=/${this.contentType}/${this.tmdbId}/recommendations?language=ru-RU`);
        if (recommendationsResponse.ok) {
            const recommendationsData = await recommendationsResponse.json();
            if (recommendationsData.results?.length > 0) {
                for (const item of recommendationsData.results.slice(0, 12)) {
                    let itemDetails = null;
                    if (item.first_air_date) {
                        const tvResponse = await fetch(`${API_BASE}?tmdb=/tv/${item.id}?language=ru-RU`);
                        if (tvResponse.ok) itemDetails = await tvResponse.json();
                    } else {
                        const movieResponse = await fetch(`${API_BASE}?tmdb=/movie/${item.id}?language=ru-RU`);
                        if (movieResponse.ok) itemDetails = await movieResponse.json();
                    }
                    this.similarItemsData.push({
                        id: item.id,
                        title: item.title || item.name,
                        year: (item.release_date || item.first_air_date || '').split('-')[0],
                        poster_path: item.poster_path,
                        vote_average: item.vote_average,
                        runtime: itemDetails?.runtime || null,
                        number_of_seasons: itemDetails?.number_of_seasons || null,
                        number_of_episodes: itemDetails?.number_of_episodes || null,
                        first_air_date: item.first_air_date || null,
                        release_date: item.release_date || null,
                        name: item.name || null
                    });
                }
            }
        }
    }
    
    async loadSeasonsData() {
        if (!this.tmdbData?.seasons) return;
        
        this.seasonsData = this.tmdbData.seasons.filter(s => s.season_number > 0);
        
        for (const season of this.seasonsData) {
            const seasonNum = season.season_number;
            try {
                const response = await fetch(`${API_BASE}?tmdb=/tv/${this.tmdbId}/season/${seasonNum}?language=ru-RU`);
                if (response.ok) {
                    const data = await response.json();
                    this.episodesData[seasonNum] = data.episodes || [];
                } else {
                    this.episodesData[seasonNum] = [];
                }
            } catch(e) {
                this.episodesData[seasonNum] = [];
            }
        }
        
        if (this.seasonsData.length > 0) {
            this.currentSeason = this.seasonsData[0].season_number;
        }
    }
    
    createAgeModal() {
        if (this.ageModal) return this.ageModal;
        
        this.ageModal = document.createElement('div');
        this.ageModal.id = 'ageModal';
        this.ageModal.className = 'age-modal';
        this.ageModal.style.background = 'transparent';
        this.ageModal.style.backdropFilter = 'blur(12px)';
        this.ageModal.style.WebkitBackdropFilter = 'blur(12px)';
        this.ageModal.innerHTML = `
            <div class="age-modal-content" onclick="event.stopPropagation()">
                <div class="age-icon"><span>18+</span></div>
                <h2 class="age-title">Подтверждение возраста</h2>
                <div class="movie-info-preview"><i class="fas fa-film"></i><span id="ageModalMovieTitlePage"></span></div>
                <p class="age-message">Этот материал содержит сцены <strong>насилия, жестокости</strong> и <strong>ненормативную лексику</strong>.</p>
                <div class="age-warning"><p><i class="fas fa-exclamation-triangle"></i><span>Контент предназначен только для зрителей старше 18 лет. Нажимая «Да», вы подтверждаете свой возраст.</span></p></div>
                <div class="age-buttons">
                    <button class="age-btn age-btn-no" id="ageModalNoPage"><i class="fas fa-times"></i> Нет, мне нет 18</button>
                    <button class="age-btn age-btn-yes" id="ageModalYesPage"><i class="fas fa-check"></i> Да, мне есть 18</button>
                </div>
            </div>
        `;
        document.body.appendChild(this.ageModal);
        
        document.getElementById('ageModalNoPage').addEventListener('click', () => { this.hideAgeModal(); window.location.href = '/'; });
        document.getElementById('ageModalYesPage').addEventListener('click', () => { this.ageConfirmed = true; this.hideAgeModal(); });
        this.ageModal.addEventListener('click', () => { this.hideAgeModal(); window.location.href = '/'; });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.ageModal && this.ageModal.classList.contains('active')) { this.hideAgeModal(); window.location.href = '/'; } });
        
        return this.ageModal;
    }
    
    showAgeModal() {
        this.createAgeModal();
        document.getElementById('ageModalMovieTitlePage').textContent = this.getMovieTitle();
        requestAnimationFrame(() => { this.ageModal.classList.add('active'); document.body.style.overflow = 'hidden'; });
    }
    
    hideAgeModal() {
        if (!this.ageModal) return;
        this.ageModal.classList.remove('active');
        document.body.style.overflow = '';
    }
    
    async convertToSlugUrl() {
        if (!this.tmdbData) return;
        const title = this.tmdbData.title || this.tmdbData.name;
        const year = (this.tmdbData.release_date || this.tmdbData.first_air_date || '').split('-')[0];
        const slug = this.createSlug(title, year);
        const newUrl = `/${this.contentType}/${slug}-${this.tmdbId}`;
        const currentPath = window.location.pathname.replace(/\/$/, '');
        const hasCorrectFormat = currentPath.match(new RegExp(`^/${this.contentType}/[a-z0-9-]+-${this.tmdbId}$`));
        const isShortFormat = currentPath.match(`^/${this.contentType}/${this.tmdbId}$`);
        const isKinopoiskFormat = currentPath.match(`^/(film|series)/\\d+$`);
        if (!hasCorrectFormat && (isShortFormat || isKinopoiskFormat || currentPath !== newUrl)) {
            window.history.replaceState(null, '', newUrl);
        }
    }
    
    showError(message) {
        this.loadError = true;
        const errorContainer = document.getElementById('error-container');
        const errorMessage = document.getElementById('error-message');
        if (errorContainer && errorMessage) {
            errorContainer.style.display = 'block';
            errorMessage.textContent = message || 'Ошибка загрузки данных. Попробуйте позже.';
        }
    }
    
    createSlug(title, year = '') {
        if (!title) return 'film';
        const map = {'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'};
        let slug = title.toLowerCase().split('').map(c => map[c] || c).join('');
        slug = slug.replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        return year ? `${slug}-${year}` : slug;
    }
    
    checkReleaseDate() {
        let dateStr = this.tmdbData?.release_date || this.tmdbData?.first_air_date || this.kinopoiskData?.premiereWorld;
        if (dateStr) {
            const releaseDate = new Date(dateStr);
            const today = new Date();
            today.setHours(0,0,0,0);
            this.isReleased = releaseDate <= today;
            this.releaseDate = dateStr;
        } else {
            this.isReleased = true;
        }
    }
    
    updateWatchButton() {
        const watchBtn = document.getElementById('watch-button');
        if (!watchBtn) return;
        if (!this.isReleased) {
            watchBtn.innerHTML = `<i class="fas fa-clock"></i> СКОРО`;
            watchBtn.classList.add('disabled');
            watchBtn.disabled = true;
        } else {
            watchBtn.innerHTML = `<i class="fas fa-play"></i> СМОТРЕТЬ`;
            watchBtn.classList.remove('disabled');
            watchBtn.disabled = false;
        }
    }
    
    getBookmarks() { return JSON.parse(localStorage.getItem('kkpoisk_bookmarks') || '[]'); }
    saveBookmarks(bookmarks) { localStorage.setItem('kkpoisk_bookmarks', JSON.stringify(bookmarks)); }
    
    checkBookmarkStatus() {
        const bookmarks = this.getBookmarks();
        this.isBookmarked = bookmarks.some(b => b.tmdbId == this.tmdbId);
        this.updateBookmarkIcon();
    }
    
    updateBookmarkIcon() {
        const icon = document.getElementById('bookmark-icon');
        if (icon) {
            if (this.isBookmarked) icon.classList.add('active');
            else icon.classList.remove('active');
        }
    }
    
    animateBookmarkIcon() {
        const icon = document.getElementById('bookmark-icon');
        if (icon) {
            icon.classList.add('bookmark-animation');
            setTimeout(() => { icon.classList.remove('bookmark-animation'); }, 200);
        }
    }
    
    toggleBookmark() {
        const bookmarks = this.getBookmarks();
        const index = bookmarks.findIndex(b => b.tmdbId == this.tmdbId);
        const title = this.getMovieTitle();
        const year = this.getMovieYear();
        const posterPath = this.tmdbData?.poster_path || '';
        
        if (index === -1) {
            bookmarks.push({ tmdbId: this.tmdbId, title: title, year: year, posterPath: posterPath, type: this.contentType });
            this.isBookmarked = true;
            this.animateBookmarkIcon();
            showToast(`«${title}» добавлен в закладки`);
        } else {
            bookmarks.splice(index, 1);
            this.isBookmarked = false;
            this.animateBookmarkIcon();
            showToast(`«${title}» удалён из закладок`);
        }
        this.saveBookmarks(bookmarks);
        this.updateBookmarkIcon();
    }
    
    renderMetadataBlock(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        if (!this.tmdbData) { container.innerHTML = '<div class="metadata-block"><div class="metadata-row"><div class="metadata-value">Нет данных</div></div></div>'; return; }
        
        let html = '<div class="metadata-block">';
        if (this.tmdbData.tagline) html += `<div class="metadata-row"><div class="metadata-label">Слоган</div><div class="metadata-value multi">${this.escapeHtml(this.tmdbData.tagline)}</div></div>`;
        const originalTitle = this.tmdbData.original_title || this.tmdbData.original_name;
        if (originalTitle && originalTitle !== this.getMovieTitle()) html += `<div class="metadata-row"><div class="metadata-label">Оригинальное название</div><div class="metadata-value">${this.escapeHtml(originalTitle)}</div></div>`;
        if (this.ageRating && this.ageRating !== '') {
            let cleanRating = this.ageRating;
            if (cleanRating.includes('++')) cleanRating = cleanRating.replace('++', '+');
            html += `<div class="metadata-row"><div class="metadata-label">Возрастное ограничение</div><div class="metadata-value">${cleanRating}</div></div>`;
        } else if (this.tmdbData?.adult) {
            html += `<div class="metadata-row"><div class="metadata-label">Возрастное ограничение</div><div class="metadata-value">18+</div></div>`;
        }
        const genres = this.tmdbData?.genres?.map(g=>g.name).join(', ');
        if (genres) html += `<div class="metadata-row"><div class="metadata-label">Жанры</div><div class="metadata-value multi">${this.escapeHtml(genres)}</div></div>`;
        const countries = this.tmdbData?.production_countries?.map(c=>c.name).join(', ');
        if (countries) html += `<div class="metadata-row"><div class="metadata-label">Страна производства</div><div class="metadata-value">${this.escapeHtml(countries)}</div></div>`;
        const duration = this.tmdbData?.runtime;
        if (duration > 0) html += `<div class="metadata-row"><div class="metadata-label">Длительность</div><div class="metadata-value">${this.formatDuration(duration)}</div></div>`;
        const rating = this.tmdbData?.vote_average;
        if (rating > 0) html += `<div class="metadata-row"><div class="metadata-label">Рейтинг</div><div class="metadata-value metadata-rating">${rating.toFixed(1)}</div></div>`;
        const budget = this.tmdbData?.budget;
        if (budget > 0) html += `<div class="metadata-row"><div class="metadata-label">Бюджет</div><div class="metadata-value metadata-money">$${budget.toLocaleString()}</div></div>`;
        const revenue = this.tmdbData?.revenue;
        if (revenue > 0) html += `<div class="metadata-row"><div class="metadata-label">Кассовые сборы</div><div class="metadata-value metadata-money">$${revenue.toLocaleString()}</div></div>`;
        html += '</div>';
        container.innerHTML = html;
    }
    
    renderCastSection() {
        const castContainer = document.getElementById('cast-grid');
        const castSection = document.getElementById('cast-section');
        if (!castContainer || !castSection) return;
        if (this.castData.length === 0) { castSection.style.display = 'none'; return; }
        
        castSection.style.display = 'block';
        castContainer.innerHTML = '';
        
        for (const actor of this.castData) {
            const actorId = actor.id;
            const name = actor.name;
            const character = actor.character;
            const profilePath = actor.profile_path;
            
            const actorCard = document.createElement('div');
            actorCard.className = 'collection-card cast-card';
            actorCard.onclick = () => {
                const slug = this.createSlug(name, '');
                window.location.href = `/person/${slug}-${actorId}`;
            };
            
            if (profilePath) {
                const profileUrl = `${API_BASE}?image=${encodeURIComponent(profilePath)}`;
                actorCard.innerHTML = `<div class="collection-poster cast-poster"><img src="${profileUrl}" alt="${this.escapeHtml(name)}" onerror="this.onerror=null; this.parentElement.innerHTML = '<div class=\\'no-image-placeholder\\'><i class=\\'fas fa-user\\'></i></div>'">${actor.vote_average ? `<div class="collection-rating cast-rating">${actor.vote_average.toFixed(1)}</div>` : ''}</div><div class="collection-content"><div class="collection-title-text">${this.escapeHtml(name)}</div><div class="collection-meta cast-character">${this.escapeHtml(character || '—')}</div></div>`;
            } else {
                actorCard.innerHTML = `<div class="collection-poster cast-poster"><div class="no-image-placeholder"><i class="fas fa-user"></i></div>${actor.vote_average ? `<div class="collection-rating cast-rating">${actor.vote_average.toFixed(1)}</div>` : ''}</div><div class="collection-content"><div class="collection-title-text">${this.escapeHtml(name)}</div><div class="collection-meta cast-character">${this.escapeHtml(character || '—')}</div></div>`;
            }
            castContainer.appendChild(actorCard);
        }
        
        this.initScrollbar('cast-container', 'cast-scrollbar');
    }
    
    formatSeriesInfo(episodes, seasons) {
        const parts = [];
        if (episodes && episodes > 0) parts.push(`${episodes} ${this.getEpisodeWord(episodes)}`);
        if (seasons && seasons > 0) parts.push(`${seasons} ${this.getSeasonWord(seasons)}`);
        if (parts.length === 0) return '—';
        return parts.join(' / ');
    }
    
    getSeasonWord(num) {
        if (num % 10 === 1 && num % 100 !== 11) return 'сезон';
        if (num % 10 >= 2 && num % 10 <= 4 && (num % 100 < 10 || num % 100 >= 20)) return 'сезона';
        return 'сезонов';
    }
    
    getEpisodeWord(num) {
        if (num % 10 === 1 && num % 100 !== 11) return 'серия';
        if (num % 10 >= 2 && num % 10 <= 4 && (num % 100 < 10 || num % 100 >= 20)) return 'серии';
        return 'серий';
    }
    
    setupDescriptionToggle() {
        const container = document.getElementById('movie-description');
        const fullText = this.getMovieDescription() || 'Описание отсутствует';
        if (!container) return;
        
        const truncateText = (text, maxLength) => {
            if (text.length <= maxLength) return text;
            let truncated = text.substring(0, maxLength);
            let lastSpace = truncated.lastIndexOf(' ');
            if (lastSpace > 0) truncated = truncated.substring(0, lastSpace);
            return truncated;
        };
        
        const createDescription = (isExpanded) => {
            container.innerHTML = '';
            if (isExpanded) {
                const textSpan = document.createElement('span');
                textSpan.className = 'description-text';
                textSpan.textContent = fullText;
                container.appendChild(textSpan);
                const space = document.createTextNode(' ');
                container.appendChild(space);
                const toggleBtn = document.createElement('button');
                toggleBtn.className = 'description-toggle';
                toggleBtn.textContent = 'Скрыть';
                toggleBtn.onclick = (e) => { e.preventDefault(); this.expanded = false; createDescription(false); };
                container.appendChild(toggleBtn);
            } else {
                const maxChars = 320;
                let isLong = fullText.length > maxChars;
                let displayText = fullText;
                let needsToggle = false;
                if (isLong) { displayText = truncateText(fullText, maxChars); needsToggle = true; }
                const textSpan = document.createElement('span');
                textSpan.className = 'description-text';
                textSpan.textContent = displayText;
                container.appendChild(textSpan);
                if (needsToggle) {
                    const dots = document.createElement('span');
                    dots.className = 'description-dots';
                    dots.textContent = '... ';
                    container.appendChild(dots);
                    const toggleBtn = document.createElement('button');
                    toggleBtn.className = 'description-toggle';
                    toggleBtn.textContent = 'Ещё';
                    toggleBtn.onclick = (e) => { e.preventDefault(); this.expanded = true; createDescription(true); };
                    container.appendChild(toggleBtn);
                }
            }
        };
        
        this.expanded = false;
        createDescription(false);
    }
    
    renderMediaSection(type) {
        const container = document.getElementById('media-grid');
        if (!container) return;
        
        if (type === 'posters') {
            if (this.imagesData.posters.length === 0) {
                container.innerHTML = '<div class="empty-media"><i class="fas fa-poster" style="font-size: 48px; margin-bottom: 16px; display: block;"></i>Нет постеров</div>';
                return;
            }
            container.innerHTML = this.imagesData.posters.map(item => `<div class="media-item poster-item" onclick="openImageModal('${API_BASE}?image=${item.file_path}')"><img src="${API_BASE}?image=${item.file_path}" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML = '<div class=\\'no-image-placeholder\\'><i class=\\'fas fa-image\\'></i></div>'"></div>`).join('');
        } else if (type === 'backdrops') {
            if (this.imagesData.backdrops.length === 0) {
                container.innerHTML = '<div class="empty-media"><i class="fas fa-image" style="font-size: 48px; margin-bottom: 16px; display: block;"></i>Нет задников</div>';
                return;
            }
            container.innerHTML = this.imagesData.backdrops.map(item => `<div class="media-item backdrop-item" onclick="openImageModal('${API_BASE}?image=${item.file_path}')"><img src="${API_BASE}?image=${item.file_path}" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML = '<div class=\\'no-image-placeholder\\'><i class=\\'fas fa-image\\'></i></div>'"></div>`).join('');
        } else if (type === 'logos') {
            if (this.imagesData.logos.length === 0) {
                container.innerHTML = '<div class="empty-media"><i class="fas fa-trademark" style="font-size: 48px; margin-bottom: 16px; display: block;"></i>Нет логотипов</div>';
                return;
            }
            container.innerHTML = this.imagesData.logos.map(item => `<div class="media-item logo-item" onclick="openImageModal('${API_BASE}?image=${item.file_path}')"><img src="${API_BASE}?image=${item.file_path}" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML = '<div class=\\'no-image-placeholder\\'><i class=\\'fas fa-trademark\\'></i></div>'"><span class="lang-badge">${item.iso_639_1?.toUpperCase() || '?'}</span></div>`).join('');
        }
        container.scrollLeft = 0;
    }
    
    async displayCollectionAndSimilar() {
        const collectionSection = document.getElementById('collection-section');
        const collectionContainer = document.getElementById('collection-container');
        const collectionGrid = document.getElementById('collection-grid');
        const collectionTitle = document.getElementById('collection-title');
        const similarSection = document.getElementById('similar-section');
        const similarContainer = document.getElementById('similar-container');
        const similarGrid = document.getElementById('similar-grid');
        const similarTitle = document.getElementById('similar-title');
        
        const currentId = this.tmdbId;
        
        if (this.collectionItemsData?.length > 1) {
            const filtered = this.collectionItemsData.filter(item => item.id != currentId);
            if (filtered.length > 0) {
                collectionSection.style.display = 'block';
                collectionTitle.textContent = this.tmdbData?.belongs_to_collection?.name || 'Все части франшизы';
                collectionGrid.innerHTML = '';
                for (const movie of filtered) {
                    const isTvShow = movie.first_air_date || movie.name;
                    let year = (movie.release_date || movie.first_air_date || '').split('-')[0] || '—';
                    let info = isTvShow ? this.formatSeriesInfo(movie.number_of_episodes, movie.number_of_seasons) : (movie.runtime ? this.formatDuration(movie.runtime) : '—');
                    const slug = this.createSlug(movie.title || movie.name, year);
                    const card = document.createElement('div');
                    card.className = 'collection-card';
                    if (movie.poster_path) {
                        const posterUrl = `${API_BASE}?image=${encodeURIComponent(movie.poster_path)}`;
                        card.innerHTML = `<div class="collection-poster"><img src="${posterUrl}" onerror="this.onerror=null; this.parentElement.innerHTML = '<div class=\\'no-image-placeholder\\'><i class=\\'fas fa-image\\'></i></div>'">${movie.vote_average > 0 ? `<div class="collection-rating">${movie.vote_average.toFixed(1)}</div>` : ''}</div><div class="collection-content"><div class="collection-title-text">${this.escapeHtml(movie.title || movie.name)}</div><div class="collection-meta"><span>${year}</span><span>${info}</span></div></div>`;
                    } else {
                        card.innerHTML = `<div class="collection-poster"><div class="no-image-placeholder"><i class="fas fa-image"></i></div>${movie.vote_average > 0 ? `<div class="collection-rating">${movie.vote_average.toFixed(1)}</div>` : ''}</div><div class="collection-content"><div class="collection-title-text">${this.escapeHtml(movie.title || movie.name)}</div><div class="collection-meta"><span>${year}</span><span>${info}</span></div></div>`;
                    }
                    card.onclick = () => { const targetType = isTvShow ? 'tv' : 'movie'; window.location.href = `/${targetType}/${slug}-${movie.id}`; };
                    collectionGrid.appendChild(card);
                }
                this.initScrollbar('collection-container', 'collection-scrollbar');
                if (collectionContainer) collectionContainer.scrollLeft = 0;
            } else { collectionSection.style.display = 'none'; }
        } else { collectionSection.style.display = 'none'; }
        
        if (this.similarItemsData?.length > 0) {
            const filtered = this.similarItemsData.filter(item => item.id != currentId);
            if (filtered.length > 0) {
                similarSection.style.display = 'block';
                similarTitle.textContent = `Похожие ${this.contentType === 'tv' ? 'сериалы' : 'фильмы'}`;
                similarGrid.innerHTML = '';
                for (const movie of filtered) {
                    const isTvShow = movie.first_air_date || movie.name;
                    let year = (movie.release_date || movie.first_air_date || '').split('-')[0] || '—';
                    let info = isTvShow ? this.formatSeriesInfo(movie.number_of_episodes, movie.number_of_seasons) : (movie.runtime ? this.formatDuration(movie.runtime) : '—');
                    const slug = this.createSlug(movie.title || movie.name, year);
                    const card = document.createElement('div');
                    card.className = 'collection-card';
                    if (movie.poster_path) {
                        const posterUrl = `${API_BASE}?image=${encodeURIComponent(movie.poster_path)}`;
                        card.innerHTML = `<div class="collection-poster"><img src="${posterUrl}" onerror="this.onerror=null; this.parentElement.innerHTML = '<div class=\\'no-image-placeholder\\'><i class=\\'fas fa-image\\'></i></div>'">${movie.vote_average > 0 ? `<div class="collection-rating">${movie.vote_average.toFixed(1)}</div>` : ''}</div><div class="collection-content"><div class="collection-title-text">${this.escapeHtml(movie.title || movie.name)}</div><div class="collection-meta"><span>${year}</span><span>${info}</span></div></div>`;
                    } else {
                        card.innerHTML = `<div class="collection-poster"><div class="no-image-placeholder"><i class="fas fa-image"></i></div>${movie.vote_average > 0 ? `<div class="collection-rating">${movie.vote_average.toFixed(1)}</div>` : ''}</div><div class="collection-content"><div class="collection-title-text">${this.escapeHtml(movie.title || movie.name)}</div><div class="collection-meta"><span>${year}</span><span>${info}</span></div></div>`;
                    }
                    card.onclick = () => { const targetType = isTvShow ? 'tv' : 'movie'; window.location.href = `/${targetType}/${slug}-${movie.id}`; };
                    similarGrid.appendChild(card);
                }
                this.initScrollbar('similar-container', 'similar-scrollbar');
                if (similarContainer) similarContainer.scrollLeft = 0;
            } else { similarSection.style.display = 'none'; }
        } else { similarSection.style.display = 'none'; }
        
        this.renderMetadataBlock('desktop-metadata-sidebar');
        this.renderMetadataBlock('mobile-metadata-wrapper');
        this.alignMetadataWithDescription();
    }
    
    alignMetadataWithDescription() {
        const desc = document.getElementById('movie-description');
        const sidebar = document.getElementById('desktop-metadata-sidebar');
        if (!desc || !sidebar) return;
        sidebar.style.marginTop = desc.offsetTop + 'px';
    }
    
    initScrollbar(containerId, scrollbarId) {
        const container = document.getElementById(containerId);
        const scrollbar = document.getElementById(scrollbarId);
        if (!container || !scrollbar) return;
        
        const thumb = scrollbar.querySelector('.custom-scrollbar-thumb');
        if (!thumb) return;
        
        const updateScrollbar = () => {
            const scrollWidth = container.scrollWidth;
            const clientWidth = container.clientWidth;
            if (scrollWidth <= clientWidth) {
                scrollbar.classList.remove('visible');
                return;
            }
            scrollbar.classList.add('visible');
            const thumbPercent = (clientWidth / scrollWidth) * 100;
            thumb.style.width = `${thumbPercent}%`;
            const scrollPercent = container.scrollLeft / (scrollWidth - clientWidth);
            const maxThumbOffset = 100 - thumbPercent;
            thumb.style.marginLeft = `${scrollPercent * maxThumbOffset}%`;
        };
        
        const handleScroll = () => {
            const scrollWidth = container.scrollWidth;
            const clientWidth = container.clientWidth;
            if (scrollWidth <= clientWidth) return;
            const thumbPercent = (clientWidth / scrollWidth) * 100;
            const scrollPercent = container.scrollLeft / (scrollWidth - clientWidth);
            thumb.style.marginLeft = `${scrollPercent * (100 - thumbPercent)}%`;
        };
        
        let isDragging = false;
        const handleThumbDrag = (e) => {
            isDragging = true;
            const track = scrollbar.querySelector('.custom-scrollbar-track');
            const trackRect = track.getBoundingClientRect();
            const scrollWidth = container.scrollWidth;
            const clientWidth = container.clientWidth;
            const maxScrollLeft = scrollWidth - clientWidth;
            const thumbPercent = (clientWidth / scrollWidth) * 100;
            const maxThumbOffset = 100 - thumbPercent;
            
            const onMouseMove = (moveEvent) => {
                if (!isDragging) return;
                let x = moveEvent.clientX - trackRect.left;
                x = Math.max(0, Math.min(x, trackRect.width));
                const percent = x / trackRect.width;
                thumb.style.marginLeft = `${Math.min(maxThumbOffset, Math.max(0, percent * maxThumbOffset))}%`;
                container.scrollLeft = percent * maxScrollLeft;
            };
            
            const onMouseUp = () => {
                isDragging = false;
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };
            
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            e.preventDefault();
        };
        
        container.addEventListener('scroll', handleScroll);
        thumb.addEventListener('mousedown', handleThumbDrag);
        window.addEventListener('resize', updateScrollbar);
        
        const observer = new MutationObserver(updateScrollbar);
        observer.observe(container, { childList: true, subtree: true, attributes: true });
        setTimeout(updateScrollbar, 100);
    }
    
    escapeHtml(text) { if (!text) return ''; const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
    formatDuration(minutes) { if (!minutes || minutes <= 0) return '—'; const hours = Math.floor(minutes / 60); const mins = minutes % 60; if (hours > 0 && mins > 0) return `${hours}ч ${mins}мин`; if (hours > 0) return `${hours}ч`; return `${mins}мин`; }
    
    setupPoster() {
        return new Promise((resolve) => {
            const img = document.getElementById('poster-image');
            const bg = document.getElementById('poster-background');
            
            const finish = () => {
                if (bg) {
                    bg.style.display = 'block';
                    setTimeout(() => { bg.classList.add('loaded'); resolve(); }, 100);
                } else { resolve(); }
            };
            
            if (!img) { finish(); return; }
            
            img.style.objectFit = 'cover';
            img.style.objectPosition = `${POSTER_POSITION.horizontal}% ${POSTER_POSITION.vertical}%`;
            img.style.width = '100%';
            img.style.height = '100%';
            
            const isMobile = window.innerWidth <= 768;
            let imageUrl = null;
            
            if (isMobile) {
                if (this.posterWithoutLang) imageUrl = `${API_BASE}?image=${encodeURIComponent(this.posterWithoutLang)}`;
                else if (this.bestBackdrop) imageUrl = `${API_BASE}?image=${encodeURIComponent(this.bestBackdrop)}`;
                else if (this.tmdbData?.backdrop_path) imageUrl = `${API_BASE}?image=${encodeURIComponent(this.tmdbData.backdrop_path)}`;
            } else {
                if (this.bestBackdrop) imageUrl = `${API_BASE}?image=${encodeURIComponent(this.bestBackdrop)}`;
                else if (this.tmdbData?.backdrop_path) imageUrl = `${API_BASE}?image=${encodeURIComponent(this.tmdbData.backdrop_path)}`;
                else if (this.posterWithoutLang) imageUrl = `${API_BASE}?image=${encodeURIComponent(this.posterWithoutLang)}`;
            }
            
            if (imageUrl) {
                img.onload = () => { finish(); };
                img.onerror = () => { img.src = NO_BACKDROP_URL; img.onload = finish; img.onerror = finish; };
                img.src = imageUrl;
            } else {
                img.src = NO_BACKDROP_URL;
                img.onload = finish;
                img.onerror = finish;
            }
            
            setTimeout(finish, 3000);
        });
    }
    
    getEpisodeImagePath(episode) {
        if (episode.still_path) return episode.still_path;
        if (this.bestBackdrop) return this.bestBackdrop;
        if (this.tmdbData?.backdrop_path) return this.tmdbData.backdrop_path;
        return null;
    }
    
    renderEpisodes() {
        const episodesSection = document.getElementById('episodes-section');
        if (!episodesSection) return;
        
        if (this.contentType !== 'tv' || this.seasonsData.length === 0) {
            episodesSection.style.display = 'none';
            return;
        }
        
        episodesSection.style.display = 'block';
        this.renderSeasonTabs();
        this.renderEpisodesGrid();
    }
    
    renderSeasonTabs() {
        const tabsContainer = document.getElementById('seasons-tabs-container');
        if (!tabsContainer) return;
        
        tabsContainer.innerHTML = this.seasonsData.map(season => {
            const isActive = season.season_number === this.currentSeason;
            return `<button class="season-tab ${isActive ? 'active' : ''}" data-season="${season.season_number}">${season.season_number} сезон</button>`;
        }).join('');
        
        tabsContainer.querySelectorAll('.season-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const seasonNum = parseInt(tab.dataset.season);
                this.currentSeason = seasonNum;
                tabsContainer.querySelectorAll('.season-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.renderEpisodesGrid();
            });
        });
    }
    
    renderEpisodesGrid() {
        const grid = document.getElementById('episodes-grid');
        const container = document.getElementById('episodes-grid-container');
        if (!grid) return;
        
        const episodes = this.episodesData[this.currentSeason] || [];
        
        if (episodes.length === 0) {
            grid.innerHTML = '<div style="color: #888; padding: 20px; text-align: center; width: 100%;">Нет данных о сериях</div>';
            return;
        }
        
        grid.innerHTML = '';
        
        for (const episode of episodes) {
            const episodeNum = episode.episode_number;
            const episodeName = episode.name || `Серия ${episodeNum}`;
            const imagePath = this.getEpisodeImagePath(episode);
            const airDate = episode.air_date;
            const runtime = episode.runtime;
            
            let isAired = true;
            if (airDate) {
                const airDateObj = new Date(airDate);
                const today = new Date();
                today.setHours(0,0,0,0);
                isAired = airDateObj <= today;
            }
            
            const card = document.createElement('div');
            card.className = `episode-card ${isAired ? 'episode-aired' : 'episode-unaired'}`;
            
            let posterHtml = '';
            if (imagePath) {
                const imageUrl = `${API_BASE}?image=${encodeURIComponent(imagePath)}`;
                posterHtml = `<img src="${imageUrl}" alt="${this.escapeHtml(episodeName)}" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML = '<div class=\\'no-image-placeholder\\'><i class=\\'fas fa-image\\'></i></div>'">`;
            } else {
                posterHtml = `<div class="no-image-placeholder"><i class="fas fa-image"></i></div>`;
            }
            
            const overlayIcon = isAired ? '<i class="fas fa-play"></i>' : '<i class="fas fa-clock"></i>';
            
            const fullTitle = `${episodeNum} серия: ${episodeName}`;
            
            let durationBadge = '';
            if (runtime && runtime > 0) {
                durationBadge = `<div class="episode-duration-badge">${runtime} мин</div>`;
            }
            
            card.innerHTML = `
                <div class="episode-poster">
                    ${posterHtml}
                    <div class="episode-poster-overlay">
                        ${overlayIcon}
                    </div>
                    ${durationBadge}
                </div>
                <div class="episode-info">
                    <div class="episode-info-title">${this.escapeHtml(fullTitle)}</div>
                </div>
            `;
            
            if (isAired) {
                card.addEventListener('click', () => {
                    this.openEpisodePlayer(this.currentSeason, episodeNum);
                });
            }
            
            grid.appendChild(card);
        }
        
        this.initScrollbar('episodes-grid-container', 'episodes-scrollbar');
        if (container) container.scrollLeft = 0;
    }
    
    // ===== РЕКЛАМНЫЙ БАНЕР =====
    createAdOverlay(containerSelector) {
        if (this.adOverlay) {
            this.adOverlay.remove();
            this.adOverlay = null;
            this.adClosed = false;
            this.adSkipEnabled = false;
        }
        
        // Находим контейнер модального окна
        const container = document.querySelector(containerSelector);
        if (!container) return null;
        
        // Создаём оверлей как дочерний элемент контейнера
        this.adOverlay = document.createElement('div');
        this.adOverlay.id = 'adOverlay';
        
        // Оверлей внутри контейнера, растянут на всю его площадь
        this.adOverlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.92);
            z-index: 99999;
            display: flex;
            justify-content: center;
            align-items: center;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.3s ease, visibility 0.3s ease;
            cursor: pointer;
            border-radius: inherit;
            overflow: hidden;
            pointer-events: none;
        `;
        
        this.adOverlay.innerHTML = `
            <div style="position: relative; width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; cursor: pointer; pointer-events: auto;" onclick="window.moviePage.openAdLink()">
                <img src="${AD_IMAGE_URL}" alt="Реклама" style="width: 100%; height: 100%; object-fit: cover; display: block;">
                
                <div id="adTimer" style="
                    position: absolute;
                    top: 20px;
                    left: 24px;
                    color: #ffffff;
                    font-size: 13px;
                    font-weight: 300;
                    font-family: 'Inter', sans-serif;
                    pointer-events: none;
                    text-shadow: 0 1px 4px rgba(0,0,0,0.5);
                    letter-spacing: 0.5px;
                ">15</div>
                
                <button id="adSubscribeBtn" style="
                    position: absolute;
                    top: 16px;
                    right: 16px;
                    background: #0088cc;
                    color: #fff;
                    border: none;
                    font-size: 11px;
                    font-weight: 600;
                    font-family: 'Inter', sans-serif;
                    padding: 6px 14px;
                    border-radius: 7px;
                    cursor: pointer;
                    transition: background 0.3s ease, transform 0.2s ease;
                    box-shadow: 0 4px 15px rgba(0, 136, 204, 0.4);
                    pointer-events: auto;
                    z-index: 10;
                ">Подписаться</button>
                
                <button id="adSkipBtn" style="
                    position: absolute;
                    bottom: 20px;
                    right: 20px;
                    background: rgba(100, 100, 100, 0.8);
                    color: #fff;
                    border: 1px solid rgba(255,255,255,0.2);
                    font-size: 11px;
                    font-weight: 600;
                    font-family: 'Inter', sans-serif;
                    padding: 6px 14px;
                    border-radius: 7px;
                    cursor: not-allowed;
                    transition: all 0.3s ease;
                    backdrop-filter: blur(4px);
                    pointer-events: none;
                    z-index: 10;
                ">Пропустить 3</button>
            </div>
        `;
        
        // Добавляем оверлей внутрь контейнера
        container.style.position = 'relative';
        container.appendChild(this.adOverlay);
        
        const skipBtn = this.adOverlay.querySelector('#adSkipBtn');
        const subscribeBtn = this.adOverlay.querySelector('#adSubscribeBtn');
        const timerEl = this.adOverlay.querySelector('#adTimer');
        
        subscribeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.open('https://telegram.me/kkpoisk_channel', '_blank');
        });
        
        skipBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.adSkipEnabled) {
                this.closeAdOverlay();
            }
        });
        
        this.adCountdown = 15;
        this.adSkipEnabled = false;
        this.adClosed = false;
        
        if (this.adTimer) {
            clearInterval(this.adTimer);
            this.adTimer = null;
        }
        
        this.adTimer = setInterval(() => {
            this.adCountdown--;
            if (timerEl) timerEl.textContent = this.adCountdown;
            
            if (this.adCountdown <= 0) {
                clearInterval(this.adTimer);
                this.adTimer = null;
                this.closeAdOverlay();
            }
        }, 1000);
        
        let skipCounter = 3;
        const skipInterval = setInterval(() => {
            skipCounter--;
            if (skipCounter > 0) {
                skipBtn.textContent = `Пропустить ${skipCounter}`;
                skipBtn.style.background = 'rgba(100, 100, 100, 0.8)';
                skipBtn.style.cursor = 'not-allowed';
                skipBtn.style.pointerEvents = 'none';
            } else {
                clearInterval(skipInterval);
                skipBtn.textContent = 'Пропустить';
                skipBtn.style.background = '#e50914';
                skipBtn.style.cursor = 'pointer';
                skipBtn.style.pointerEvents = 'auto';
                skipBtn.style.borderColor = '#e50914';
                this.adSkipEnabled = true;
            }
        }, 1000);
        
        // Сохраняем ссылку на контейнер
        this.adParentContainer = container;
        
        return this.adOverlay;
    }
    
    openAdLink() {
        window.open('https://telegram.me/kkpoisk_channel', '_blank');
    }
    
    showAdOverlay(containerSelector) {
        this.adContainerSelector = containerSelector;
        this.createAdOverlay(containerSelector);
        
        // Скрываем крест закрытия
        const closeBtn = document.getElementById('closeButton');
        if (closeBtn) {
            closeBtn.style.opacity = '0';
            closeBtn.style.pointerEvents = 'none';
            this.closeButtonHidden = true;
        }
        
        if (this.adOverlay) {
            setTimeout(() => {
                this.adOverlay.style.opacity = '1';
                this.adOverlay.style.visibility = 'visible';
                this.adOverlay.style.pointerEvents = 'auto';
            }, 50);
        }
    }
    
    closeAdOverlay() {
        if (this.adClosed) return;
        this.adClosed = true;
        
        if (this.adTimer) {
            clearInterval(this.adTimer);
            this.adTimer = null;
        }
        
        // Возвращаем крест закрытия
        const closeBtn = document.getElementById('closeButton');
        if (closeBtn && this.closeButtonHidden) {
            closeBtn.style.opacity = '1';
            closeBtn.style.pointerEvents = 'auto';
            this.closeButtonHidden = false;
        }
        
        if (this.adOverlay) {
            this.adOverlay.style.pointerEvents = 'none';
            this.adOverlay.style.opacity = '0';
            this.adOverlay.style.visibility = 'hidden';
            
            setTimeout(() => {
                if (this.adOverlay) {
                    this.adOverlay.remove();
                    this.adOverlay = null;
                }
            }, 500);
        }
    }
    
    // ===== МЕТОДЫ ПЛЕЕРА =====
    openEpisodePlayer(season, episode) {
        if (this.isAdult && !this.ageConfirmed) {
            this.showAgeModal();
            return;
        }
        
        const modal = document.getElementById('player-modal');
        if (!modal) return;
        
        let posterPath = this.tmdbData?.backdrop_path || this.tmdbData?.poster_path;
        const allohaUrl = API_CONFIG.alloha.getUrl(this.tmdbId, posterPath, season, episode);
        
        const logoContainer = document.getElementById('player-modal-logo');
        if (logoContainer) {
            if (this.logoUrl) {
                const logoUrl = `${API_BASE}?image=${encodeURIComponent(this.logoUrl)}`;
                logoContainer.innerHTML = `<img src="${logoUrl}" alt="${this.escapeHtml(this.getMovieTitle())}" onerror="this.style.display='none'">`;
            } else {
                logoContainer.innerHTML = '';
            }
        }
        
        const playerFrame = document.getElementById('player-modal-frame');
        if (playerFrame) playerFrame.src = allohaUrl;
        
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        setTimeout(() => {
            this.showAdOverlay('.player-modal-content');
        }, 50);
        
        const modalClickHandler = () => {
            this.closePlayerModal();
            modal.removeEventListener('click', modalClickHandler);
        };
        modal.addEventListener('click', modalClickHandler);
        
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                this.closePlayerModal();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
        this.playerModalEscHandler = escHandler;
    }
    
    openPlayerModal() {
        if (!this.isReleased) { 
            alert(this.releaseDate ? `Премьера: ${this.releaseDate}` : 'Скоро в прокате'); 
            return; 
        }
        let season = null;
        let episode = null;
        if (this.contentType === 'tv') { season = 1; episode = 1; }
        this.openEpisodePlayer(season, episode);
    }
    
    closePlayerModal() {
        const modal = document.getElementById('player-modal');
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
            setTimeout(() => {
                const playerFrame = document.getElementById('player-modal-frame');
                if (playerFrame) playerFrame.src = '';
            }, 300);
        }
        if (this.adOverlay && !this.adClosed) {
            this.closeAdOverlay();
        }
        if (this.playerModalEscHandler) {
            document.removeEventListener('keydown', this.playerModalEscHandler);
            this.playerModalEscHandler = null;
        }
    }
    
    openTrailerModal() {
        if (this.isAdult && !this.ageConfirmed) {
            this.showAgeModal();
            return;
        }
        
        const existingModal = document.getElementById('trailer-modal');
        if (existingModal) existingModal.remove();
        
        let posterParam = '';
        if (this.tmdbData && this.tmdbData.backdrop_path) {
            const fullPosterUrl = `${window.location.origin}/api/kinopoisk?image=${encodeURIComponent(this.tmdbData.backdrop_path)}`;
            posterParam = `&poster=${encodeURIComponent(fullPosterUrl)}`;
        } else if (this.tmdbData && this.tmdbData.poster_path) {
            const fullPosterUrl = `${window.location.origin}/api/kinopoisk?image=${encodeURIComponent(this.tmdbData.poster_path)}`;
            posterParam = `&poster=${encodeURIComponent(fullPosterUrl)}`;
        }
        
        let logoUrl = null;
        if (this.logoUrl) logoUrl = `${API_BASE}?image=${encodeURIComponent(this.logoUrl)}`;
        
        const trailerUrl = `https://supervision-as.stloadi.live/t/?token=${ALLOHA_TOKEN}&tmdb=${this.tmdbId}${posterParam}`;
        
        const modal = document.createElement('div');
        modal.id = 'trailer-modal';
        modal.className = 'trailer-modal';
        modal.innerHTML = `
            <div class="trailer-modal-content" onclick="event.stopPropagation()">
                <button class="trailer-modal-close" onclick="window.moviePage.closeTrailerModal()"><i class="fas fa-times"></i></button>
                <div class="trailer-modal-container">
                    ${logoUrl ? `<div class="trailer-modal-logo"><img src="${logoUrl}" alt="${this.escapeHtml(this.getMovieTitle())}" onerror="this.style.display='none'"></div>` : ''}
                    <iframe id="trailer-player" class="trailer-modal-frame" frameborder="0" allowfullscreen allow="autoplay; encrypted-media"></iframe>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';
        
        const trailerFrame = modal.querySelector('#trailer-player');
        if (trailerFrame) trailerFrame.src = trailerUrl;
        
        requestAnimationFrame(() => { modal.classList.add('active'); });
        
        setTimeout(() => {
            this.showAdOverlay('.trailer-modal-content');
        }, 50);
        
        modal.addEventListener('click', () => { this.closeTrailerModal(); });
        
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                this.closeTrailerModal();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
        this.trailerModalEscHandler = escHandler;
    }
    
    closeTrailerModal() {
        const modal = document.getElementById('trailer-modal');
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
            setTimeout(() => { modal.remove(); }, 300);
        }
        if (this.adOverlay && !this.adClosed) {
            this.closeAdOverlay();
        }
        if (this.trailerModalEscHandler) {
            document.removeEventListener('keydown', this.trailerModalEscHandler);
            this.trailerModalEscHandler = null;
        }
    }
    
    updateUI() {
        this.setupLogo();
        this.updateWatchButton();
        
        const mediaSection = document.getElementById('media-section');
        if (mediaSection) {
            mediaSection.style.display = 'block';
            this.renderMediaSection('posters');
        }
        
        this.renderEpisodes();
        this.renderCastSection();
        this.setupEventListeners();
        this.setupPlayer();
        this.displayCollectionAndSimilar();
        this.setupDescriptionToggle();
        
        const closeBtn = document.getElementById('closeButton');
        if (closeBtn) setTimeout(() => closeBtn.classList.add('show'), 100);
        
        window.addEventListener('resize', () => { this.setupPoster(); });
    }
    
    setupLogo() {
        const container = document.getElementById('movie-logo-container');
        if (this.logoUrl) {
            const logoUrl = `${API_BASE}?image=${encodeURIComponent(this.logoUrl)}`;
            const img = document.createElement('img');
            img.src = logoUrl;
            img.alt = 'Логотип';
            img.className = 'movie-logo';
            img.onerror = () => { container.innerHTML = `<h1 class="movie-title-fallback">${this.escapeHtml(this.getMovieTitle())}</h1>`; };
            container.innerHTML = '';
            container.appendChild(img);
        } else {
            container.innerHTML = `<h1 class="movie-title-fallback">${this.escapeHtml(this.getMovieTitle())}</h1>`;
        }
    }
    
    getMovieTitle() { return this.tmdbData?.title || this.tmdbData?.name || this.kinopoiskData?.nameRu || 'Без названия'; }
    getMovieDescription() { return this.tmdbData?.overview || this.kinopoiskData?.description || 'Описание отсутствует'; }
    getMovieYear() { return this.tmdbData?.release_date?.split('-')[0] || this.tmdbData?.first_air_date?.split('-')[0] || this.kinopoiskData?.year || ''; }
    
    setupPlayer() {
        const playerFrame = document.getElementById('alloha-player');
        if (!playerFrame) return;
        let posterPath = this.tmdbData?.backdrop_path || this.tmdbData?.poster_path;
        const allohaUrl = API_CONFIG.alloha.getUrl(this.tmdbId, posterPath);
        playerFrame.src = allohaUrl;
    }
    
    setupEventListeners() {
        document.getElementById('watch-button').onclick = () => this.openPlayerModal();
        document.getElementById('trailer-button').onclick = () => this.openTrailerModal();
        document.getElementById('bookmark-button').onclick = () => this.toggleBookmark();
        document.getElementById('closeButton').onclick = () => { window.location.href = '/'; };
        
        const playerModalCloseBtn = document.getElementById('player-modal-close-btn');
        if (playerModalCloseBtn) playerModalCloseBtn.onclick = () => this.closePlayerModal();
        
        document.querySelectorAll('.media-tab').forEach(tab => {
            tab.onclick = () => {
                document.querySelectorAll('.media-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.renderMediaSection(tab.dataset.media);
            };
        });
    }
    
    hideLoadingScreen() {
        const screen = document.getElementById('loading-screen');
        if (screen && !this.loadError) {
            screen.classList.add('fade-out');
            setTimeout(() => { 
                screen.style.display = 'none'; 
                screen.classList.remove('fade-out'); 
                this.showMainContent(); 
            }, 500);
        }
    }
    
    showMainContent() { 
        document.getElementById('main-content').style.display = 'block'; 
    }
}

document.addEventListener('DOMContentLoaded', () => { 
    window.moviePage = new MoviePage(); 
});

window.addEventListener('load', () => {
    if (window.moviePage) setTimeout(() => window.moviePage.alignMetadataWithDescription(), 100);
});

window.addEventListener('resize', () => {
    if (window.moviePage) window.moviePage.alignMetadataWithDescription();
});