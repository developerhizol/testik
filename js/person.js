const API_BASE = '/api/kinopoisk';

class PersonPage {
    constructor() {
        this.personId = null;
        this.personData = null;
        this.movieCredits = [];
        this.tvCredits = [];
        this.currentTab = 'movies';
        this.init();
    }
    
    async init() {
        const urlData = this.parseUrl();
        if (!urlData || !urlData.personId) {
            window.location.href = '/';
            return;
        }
        
        this.personId = urlData.personId;
        await this.loadPersonData();
    }
    
    parseUrl() {
        const path = window.location.pathname.replace(/\/$/, '');
        
        let match = path.match(/\/person\/(?:[a-z0-9-]+-)?(\d+)$/i);
        if (match) {
            return { personId: match[1] };
        }
        
        match = path.match(/\/person\/(\d+)$/i);
        if (match) {
            return { personId: match[1] };
        }
        
        return null;
    }
    
    async loadPersonData() {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) loadingScreen.style.display = 'flex';
        
        try {
            const personResponse = await fetch(`${API_BASE}?tmdb=/person/${this.personId}?language=ru-RU`);
            if (!personResponse.ok) {
                this.showError('Не удалось загрузить данные актёра');
                return;
            }
            this.personData = await personResponse.json();
            
            const movieCreditsResponse = await fetch(`${API_BASE}?tmdb=/person/${this.personId}/movie_credits?language=ru-RU`);
            if (movieCreditsResponse.ok) {
                const movieData = await movieCreditsResponse.json();
                this.movieCredits = (movieData.cast || []).sort((a, b) => {
                    const dateA = a.release_date ? new Date(a.release_date) : new Date(0);
                    const dateB = b.release_date ? new Date(b.release_date) : new Date(0);
                    return dateB - dateA;
                });
            }
            
            const tvCreditsResponse = await fetch(`${API_BASE}?tmdb=/person/${this.personId}/tv_credits?language=ru-RU`);
            if (tvCreditsResponse.ok) {
                const tvData = await tvCreditsResponse.json();
                this.tvCredits = (tvData.cast || []).sort((a, b) => {
                    const dateA = a.first_air_date ? new Date(a.first_air_date) : new Date(0);
                    const dateB = b.first_air_date ? new Date(b.first_air_date) : new Date(0);
                    return dateB - dateA;
                });
            }
            
            await this.convertToSlugUrl();
            this.updateUI();
            this.hideLoadingScreen();
            this.fixFooter();
            
        } catch (error) {
            console.error(error);
            this.showError('Произошла ошибка при загрузке');
        }
    }
    
    translateProfession(profession) {
        const translations = {
            'Acting': 'Актёр',
            'Directing': 'Режиссёр',
            'Production': 'Продюсер',
            'Writing': 'Сценарист',
            'Editing': 'Монтажёр',
            'Camera': 'Оператор',
            'Sound': 'Звукорежиссёр',
            'Art': 'Художник',
            'Costume & Make-Up': 'Художник по костюмам',
            'Visual Effects': 'Визуальные эффекты',
            'Crew': 'Съёмочная группа',
            'Lighting': 'Освещение',
            'Creator': 'Создатель'
        };
        return translations[profession] || profession;
    }
    
    fixFooter() {
        const footer = document.querySelector('.copyright-footer');
        if (!footer) return;
        
        const checkWidth = () => {
            const width = window.innerWidth;
            if (width <= 480) {
                footer.style.display = 'flex';
                footer.style.flexWrap = 'wrap';
                footer.style.justifyContent = 'center';
                footer.style.alignItems = 'center';
                footer.style.gap = '4px';
                footer.style.padding = '10px 8px';
                
                const textSpan = footer.querySelector('.copyright-text');
                const emailLink = footer.querySelector('.copyright-email');
                
                if (textSpan) {
                    textSpan.style.whiteSpace = 'nowrap';
                    textSpan.style.fontSize = '10px';
                }
                if (emailLink) {
                    emailLink.style.whiteSpace = 'nowrap';
                    emailLink.style.fontSize = '10px';
                }
                
                if (width <= 340) {
                    footer.style.flexDirection = 'column';
                    footer.style.gap = '2px';
                    if (textSpan) textSpan.style.whiteSpace = 'normal';
                    if (emailLink) emailLink.style.whiteSpace = 'normal';
                } else {
                    footer.style.flexDirection = 'row';
                }
            } else {
                footer.style.display = '';
                footer.style.flexWrap = '';
                footer.style.gap = '';
                footer.style.padding = '';
                
                const textSpan = footer.querySelector('.copyright-text');
                const emailLink = footer.querySelector('.copyright-email');
                
                if (textSpan) {
                    textSpan.style.whiteSpace = '';
                    textSpan.style.fontSize = '';
                }
                if (emailLink) {
                    emailLink.style.whiteSpace = '';
                    emailLink.style.fontSize = '';
                }
            }
        };
        
        checkWidth();
        window.addEventListener('resize', checkWidth);
    }
    
    async convertToSlugUrl() {
        if (!this.personData) return;
        
        const name = this.personData.name;
        const slug = this.createSlug(name);
        const newUrl = `/person/${slug}-${this.personId}`;
        
        const currentPath = window.location.pathname.replace(/\/$/, '');
        const hasCorrectFormat = currentPath.match(/\/person\/[a-z0-9-]+-\d+$/i);
        const isShortFormat = currentPath.match(/\/person\/\d+$/i);
        
        if (!hasCorrectFormat && isShortFormat) {
            window.history.replaceState(null, '', newUrl);
        }
    }
    
    createSlug(text) {
        if (!text) return 'actor';
        
        const map = {'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'};
        
        let slug = text.toLowerCase().split('').map(c => map[c] || c).join('');
        slug = slug.replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        return slug;
    }
    
    updateUI() {
        document.title = `${this.personData.name} — ProKino`;
        
        document.getElementById('person-name').textContent = this.personData.name;
        
        const photoContainer = document.getElementById('person-photo');
        const profilePath = this.personData.profile_path;
        
        if (profilePath) {
            const photoUrl = `${API_BASE}?image=${encodeURIComponent(profilePath)}`;
            photoContainer.src = photoUrl;
            photoContainer.alt = this.personData.name;
            photoContainer.onerror = () => {
                photoContainer.parentElement.innerHTML = `<div class="no-image-placeholder" style="width:100%;height:100%;background:#2a2a2a;display:flex;align-items:center;justify-content:center;"><i class="fas fa-user" style="font-size:64px;color:#666;"></i></div>`;
            };
        } else {
            photoContainer.parentElement.innerHTML = `<div class="no-image-placeholder" style="width:100%;height:100%;background:#2a2a2a;display:flex;align-items:center;justify-content:center;"><i class="fas fa-user" style="font-size:64px;color:#666;"></i></div>`;
        }
        
        this.renderMetaInfo();
        this.renderBiography();
        this.renderFilmography();
        this.setupEventListeners();
        
        document.getElementById('main-content').style.display = 'block';
    }
    
    renderMetaInfo() {
        const metaContainer = document.getElementById('person-meta');
        let html = '<div class="meta-list">';
        
        if (this.personData.birthday) {
            const birthDate = new Date(this.personData.birthday);
            const today = new Date();
            let age = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                age--;
            }
            
            const formattedDate = birthDate.toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });
            
            html += `<div class="meta-item">
                        <i class="fas fa-calendar-alt"></i>
                        <strong>Дата рождения:</strong>
                        <span class="meta-value">${formattedDate} (${age} лет)</span>
                    </div>`;
        }
        
        if (this.personData.place_of_birth) {
            html += `<div class="meta-item">
                        <i class="fas fa-map-marker-alt"></i>
                        <strong>Место рождения:</strong>
                        <span class="meta-value">${this.escapeHtml(this.personData.place_of_birth)}</span>
                    </div>`;
        }
        
        if (this.personData.known_for_department) {
            const profession = this.translateProfession(this.personData.known_for_department);
            html += `<div class="meta-item">
                        <i class="fas fa-briefcase"></i>
                        <strong>Профессия:</strong>
                        <span class="meta-value">${profession}</span>
                    </div>`;
        }
        
        if (this.personData.deathday) {
            const deathDate = new Date(this.personData.deathday);
            const formattedDeathDate = deathDate.toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });
            html += `<div class="meta-item">
                        <i class="fas fa-cross"></i>
                        <strong>Дата смерти:</strong>
                        <span class="meta-value">${formattedDeathDate}</span>
                    </div>`;
        }
        
        html += '</div>';
        metaContainer.innerHTML = html;
    }
    
    renderBiography() {
        const bioContainer = document.getElementById('person-biography');
        const bioText = this.personData.biography || 'Биография отсутствует.';
        
        const truncateText = (text, maxLength) => {
            if (text.length <= maxLength) return text;
            let truncated = text.substring(0, maxLength);
            const lastSpace = truncated.lastIndexOf(' ');
            if (lastSpace > 0) {
                truncated = truncated.substring(0, lastSpace);
            }
            return truncated;
        };
        
        const maxChars = 400;
        const isLong = bioText.length > maxChars;
        
        if (isLong) {
            const truncated = truncateText(bioText, maxChars);
            bioContainer.innerHTML = `
                <span class="biography-text" id="bio-short">${this.escapeHtml(truncated)}</span>
                <span class="biography-dots">...</span>
                <span class="biography-text" id="bio-full" style="display: none;">${this.escapeHtml(bioText)}</span>
                <button class="biography-toggle" id="bio-toggle">Ещё</button>
            `;
            
            const toggleBtn = document.getElementById('bio-toggle');
            const shortBio = document.getElementById('bio-short');
            const fullBio = document.getElementById('bio-full');
            const dots = document.querySelector('.biography-dots');
            
            toggleBtn.addEventListener('click', () => {
                if (shortBio.style.display === 'none') {
                    shortBio.style.display = 'inline';
                    fullBio.style.display = 'none';
                    dots.style.display = 'inline';
                    toggleBtn.textContent = 'Ещё';
                } else {
                    shortBio.style.display = 'none';
                    fullBio.style.display = 'inline';
                    dots.style.display = 'none';
                    toggleBtn.textContent = 'Скрыть';
                }
            });
        } else {
            bioContainer.innerHTML = `<span class="biography-text">${this.escapeHtml(bioText)}</span>`;
        }
    }
    
    renderFilmography() {
        this.renderFilmographyGrid(this.currentTab);
    }
    
    renderFilmographyGrid(type) {
        const grid = document.getElementById('filmography-grid');
        const credits = type === 'movies' ? this.movieCredits : this.tvCredits;
        
        if (credits.length === 0) {
            grid.innerHTML = '<div style="color: #888; padding: 20px; text-align: center; width: 100%;">Нет данных</div>';
            return;
        }
        
        grid.innerHTML = '';
        
        for (const item of credits) {
            const posterPath = item.poster_path;
            const title = item.title || item.name || 'Без названия';
            const year = (item.release_date || item.first_air_date || '').split('-')[0];
            const rating = item.vote_average ? item.vote_average.toFixed(1) : null;
            const character = item.character || '';
            const itemType = item.title ? 'movie' : 'tv';
            
            const card = document.createElement('div');
            card.className = 'film-card';
            
            if (posterPath) {
                const posterUrl = `${API_BASE}?image=${encodeURIComponent(posterPath)}`;
                card.innerHTML = `
                    <div class="film-poster">
                        <img src="${posterUrl}" alt="${this.escapeHtml(title)}" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML = '<div class=\'no-image-placeholder\'><i class=\'fas fa-image\'></i></div>'">
                        ${rating ? `<div class="film-rating">${rating}</div>` : ''}
                    </div>
                    <div class="film-title">${this.escapeHtml(title)}</div>
                    <div class="film-year">${year || '—'}</div>
                    ${character ? `<div class="film-character">${this.escapeHtml(character)}</div>` : ''}
                `;
            } else {
                card.innerHTML = `
                    <div class="film-poster">
                        <div class="no-image-placeholder"><i class="fas fa-image"></i></div>
                        ${rating ? `<div class="film-rating">${rating}</div>` : ''}
                    </div>
                    <div class="film-title">${this.escapeHtml(title)}</div>
                    <div class="film-year">${year || '—'}</div>
                    ${character ? `<div class="film-character">${this.escapeHtml(character)}</div>` : ''}
                `;
            }
            card.onclick = () => {
                window.location.href = `/${itemType}/${item.id}`;
            };
            grid.appendChild(card);
        }
        
        this.initScrollbar();
    }
    
    initScrollbar() {
        const container = document.getElementById('filmography-container');
        const scrollbar = document.getElementById('filmography-scrollbar');
        const thumb = document.getElementById('filmography-scrollbar-thumb');
        
        if (!container || !scrollbar || !thumb) return;
        
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
            const thumbOffset = scrollPercent * maxThumbOffset;
            thumb.style.marginLeft = `${thumbOffset}%`;
        };
        
        const handleScroll = () => {
            const scrollWidth = container.scrollWidth;
            const clientWidth = container.clientWidth;
            if (scrollWidth <= clientWidth) return;
            
            const thumbPercent = (clientWidth / scrollWidth) * 100;
            const scrollPercent = container.scrollLeft / (scrollWidth - clientWidth);
            const maxThumbOffset = 100 - thumbPercent;
            const thumbOffset = scrollPercent * maxThumbOffset;
            thumb.style.marginLeft = `${thumbOffset}%`;
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
                let thumbOffset = percent * maxThumbOffset;
                thumbOffset = Math.min(maxThumbOffset, Math.max(0, thumbOffset));
                thumb.style.marginLeft = `${thumbOffset}%`;
                const scrollLeft = percent * maxScrollLeft;
                container.scrollLeft = scrollLeft;
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
        
        setTimeout(updateScrollbar, 100);
    }
    
    setupEventListeners() {
        document.getElementById('closeButton').addEventListener('click', () => {
            window.history.back();
        });
        
        document.querySelectorAll('.filmography-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.filmography-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.currentTab = tab.dataset.type;
                this.renderFilmographyGrid(this.currentTab);
            });
        });
    }
    
    hideLoadingScreen() {
        const screen = document.getElementById('loading-screen');
        if (screen) {
            screen.classList.add('fade-out');
            setTimeout(() => {
                screen.style.display = 'none';
                screen.classList.remove('fade-out');
            }, 500);
        }
    }
    
    showError(message) {
        const errorContainer = document.getElementById('error-container');
        const errorMessage = document.getElementById('error-message');
        if (errorContainer && errorMessage) {
            errorContainer.style.display = 'block';
            errorMessage.textContent = message;
        }
    }
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new PersonPage();
});
