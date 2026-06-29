(function () {
    const CROP_SIZE = 512;

    const state = {
        usuario: null,
        selectedPhoto: null,
        originalPhoto: null,
        previewObjectUrl: '',
        cropObjectUrl: '',
        cropImageReady: false,
        crop: {
            zoom: 1,
            x: 0,
            y: 0
        },
        drag: null,
        lastFocusedElement: null
    };

    document.addEventListener('DOMContentLoaded', function () {
        const form = document.getElementById('profileForm');
        const photoInput = document.getElementById('profilePhoto');
        const resetBtn = document.getElementById('profileResetBtn');
        const cropZoom = document.getElementById('profileCropZoom');
        const cropStage = document.getElementById('profileCropStage');
        const cropImage = document.getElementById('profileCropImage');
        const cropApplyBtn = document.getElementById('profileCropApplyBtn');
        const cropResetBtn = document.getElementById('profileCropResetBtn');
        const cropCancelBtn = document.getElementById('profileCropCancelBtn');
        const cropBackdrop = document.getElementById('profileCropBackdrop');
        const mfaSetupBtn = document.getElementById('mfaSetupBtn');
        const mfaDisableBtn = document.getElementById('mfaDisableBtn');

        if (!form) return;

        initProfileTabs();
        cargarPerfil();

        form.addEventListener('submit', guardarPerfil);

        if (photoInput) {
            photoInput.addEventListener('change', manejarCambioFoto);
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', function () {
                limpiarPasswords();
                limpiarFotoTemporal();
                ocultarEditorFoto();
                renderPerfil(state.usuario || obtenerUserLocal());
            });
        }

        if (cropZoom) {
            cropZoom.addEventListener('input', function () {
                state.crop.zoom = Number(cropZoom.value) || 1;
                actualizarVistaRecorte();
            });
        }

        if (cropImage) {
            cropImage.addEventListener('load', function () {
                state.cropImageReady = true;
                centrarRecorte();
            });
        }

        if (cropStage) {
            cropStage.addEventListener('pointerdown', iniciarArrastreRecorte);
            window.addEventListener('pointermove', moverRecorte);
            window.addEventListener('pointerup', terminarArrastreRecorte);
            window.addEventListener('resize', actualizarVistaRecorte);
        }

        cropApplyBtn?.addEventListener('click', aplicarRecorteFoto);
        cropResetBtn?.addEventListener('click', centrarRecorte);
        cropCancelBtn?.addEventListener('click', cancelarRecorteFoto);
        cropBackdrop?.addEventListener('click', cancelarRecorteFoto);
        mfaSetupBtn?.addEventListener('click', iniciarConfiguracionMfa);
        mfaDisableBtn?.addEventListener('click', desactivarMfa);
        document.addEventListener('keydown', function (event) {
            const panel = document.getElementById('profileCropPanel');
            if (event.key === 'Escape' && panel && !panel.hidden) {
                cancelarRecorteFoto();
            }
        });
    });

    function initProfileTabs() {
        const tabs = Array.from(document.querySelectorAll('[data-profile-tab-target]'));
        const panels = Array.from(document.querySelectorAll('[data-profile-tab-panel]'));

        if (!tabs.length || !panels.length) return;

        function activateTab(selectedTab) {
            const targetId = selectedTab.dataset.profileTabTarget;

            tabs.forEach(function (tab) {
                const isActive = tab === selectedTab;
                tab.classList.toggle('is-active', isActive);
                tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
                tab.tabIndex = isActive ? 0 : -1;
            });

            panels.forEach(function (panel) {
                const isActive = panel.id === targetId;
                panel.classList.toggle('is-active', isActive);
                panel.hidden = !isActive;
            });
        }

        tabs.forEach(function (tab, index) {
            tab.addEventListener('click', function () {
                activateTab(tab);
            });

            tab.addEventListener('keydown', function (event) {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;

                event.preventDefault();
                const lastIndex = tabs.length - 1;
                let nextIndex = index;

                if (event.key === 'ArrowRight') nextIndex = index === lastIndex ? 0 : index + 1;
                if (event.key === 'ArrowLeft') nextIndex = index === 0 ? lastIndex : index - 1;
                if (event.key === 'Home') nextIndex = 0;
                if (event.key === 'End') nextIndex = lastIndex;

                tabs[nextIndex].focus();
                activateTab(tabs[nextIndex]);
            });
        });
    }

    function cancelarRecorteFoto() {
        const input = document.getElementById('profilePhoto');

        limpiarFotoTemporal();
        ocultarEditorFoto(true);

        if (input) {
            input.value = '';
        }

        renderPerfil(state.usuario || obtenerUserLocal());
    }

    function obtenerToken() {
        return localStorage.getItem('token') || '';
    }

    function obtenerUserLocal() {
        return JSON.parse(localStorage.getItem('usuario') || '{}');
    }

    function obtenerApiBase() {
        return String(window.API_URL || '').replace(/\/$/, '');
    }

    function obtenerApiOrigin() {
        return obtenerApiBase().replace(/\/api$/, '');
    }

    function resolverUrlFoto(url) {
        if (!url) return '';

        const value = String(url);
        if (/^(https?:|data:|blob:)/i.test(value)) return value;

        const origin = obtenerApiOrigin() || window.location.origin;
        if (value.startsWith('/')) return `${origin}${value}`;

        return `${origin}/${value}`;
    }

    function obtenerIniciales(nombre) {
        return String(nombre || '')
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .map((parte) => parte[0])
            .join('')
            .toUpperCase()
            .slice(0, 2) || '--';
    }

    function etiquetaRole(rol) {
        const roles = {
            admin: 'Administrator',
            supervisor: 'Supervisor',
            usuario: 'User'
        };

        return roles[rol] || rol || 'User';
    }

    async function cargarPerfil() {
        const apiBase = obtenerApiBase();
        const token = obtenerToken();

        if (!apiBase || !token) {
            const usuarioLocal = obtenerUserLocal();
            state.usuario = usuarioLocal;
            renderPerfil(usuarioLocal);
            return;
        }

        try {
            const response = await fetch(`${apiBase}/auth/profile`, {
                credentials: 'include',
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok || data.error) {
                throw new Error(data.mensaje || data.message || 'Profile could not be loaded.');
            }

            state.usuario = data.usuario;
            localStorage.setItem('usuario', JSON.stringify(data.usuario));
            renderPerfil(data.usuario);

            if (typeof window.cargarInfoUser === 'function') {
                window.cargarInfoUser();
            }
        } catch (error) {
            console.warn('Profile could not be loaded from the backend:', error);
            const usuarioLocal = obtenerUserLocal();
            state.usuario = usuarioLocal;
            renderPerfil(usuarioLocal);
        }
    }

    function renderPerfil(usuario) {
        const departamento = usuario?.departamento || {};
        const nombre = usuario?.nombre || '';
        const email = usuario?.email || '';
        const username = usuario?.username || '';
        const roleText = etiquetaRole(usuario?.rol);
        const departmentText = departamento.nombre || departamento.label || 'No department';

        setValue('profileName', nombre);
        setValue('profileEmail', email);
        setValue('profileUsername', username);
        setValue('profileDepartment', departmentText);
        setText('profileDisplayName', nombre || 'User');
        setText('profileDisplayEmail', email || '---');
        setText('profileRoleLabel', roleText);
        setText('profileDepartmentLabel', departmentText);
        setText('profileUsernameLabel', username || '---');

        renderMfaState(usuario);
        renderAvatarPreview(usuario);
    }

    function renderMfaState(usuario) {
        const enabled = Boolean(usuario?.mfa_enabled);
        const badge = document.getElementById('profileMfaStatusBadge');
        const text = document.getElementById('profileMfaStatusText');
        const setupBtn = document.getElementById('mfaSetupBtn');
        const disableBtn = document.getElementById('mfaDisableBtn');

        if (badge) {
            badge.textContent = enabled ? 'Enabled' : 'Not enabled';
            badge.classList.toggle('is-enabled', enabled);
        }

        if (text) {
            text.textContent = enabled
                ? 'Your account asks for a Microsoft Authenticator code after the password.'
                : 'Add a 6-digit Microsoft Authenticator code after your password.';
        }

        if (setupBtn) setupBtn.hidden = enabled;
        if (disableBtn) disableBtn.hidden = !enabled;
    }

    function setValue(id, value) {
        const element = document.getElementById(id);
        if (element) element.value = value || '';
    }

    function setText(id, value) {
        const element = document.getElementById(id);
        if (element) element.textContent = value || '';
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function setButtonBusy(button, isBusy, busyText = 'Working...') {
        if (!button) return;

        if (isBusy) {
            button.dataset.originalHtml = button.innerHTML;
            button.disabled = true;
            button.innerHTML = `<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>${busyText}`;
            return;
        }

        button.disabled = false;
        if (button.dataset.originalHtml) {
            button.innerHTML = button.dataset.originalHtml;
            delete button.dataset.originalHtml;
        }
    }

    function renderAvatarPreview(usuario) {
        const avatar = document.getElementById('profileAvatarPreview');
        if (!avatar) return;

        const fotoUrl = resolverUrlFoto(usuario?.foto_perfil_url);

        if (fotoUrl) {
            avatar.textContent = '';
            avatar.classList.add('has-image');
            avatar.style.backgroundImage = `url("${fotoUrl}")`;
            return;
        }

        avatar.classList.remove('has-image');
        avatar.style.backgroundImage = '';
        avatar.textContent = obtenerIniciales(usuario?.nombre);
    }

    async function iniciarConfiguracionMfa() {
        const apiBase = obtenerApiBase();
        const token = obtenerToken();
        const setupBtn = document.getElementById('mfaSetupBtn');

        if (!apiBase || !token) {
            await Swal.fire({
                icon: 'error',
                title: 'Session unavailable',
                text: 'Sign in again to configure Microsoft Authenticator.',
                confirmButtonColor: '#102A43'
            });
            return;
        }

        setButtonBusy(setupBtn, true, 'Preparing...');

        try {
            const response = await fetch(`${apiBase}/auth/mfa/setup`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok || data.error) {
                throw new Error(data.mensaje || data.message || 'Authenticator setup could not be started.');
            }

            await confirmarConfiguracionMfa(data);
        } catch (error) {
            console.error('MFA setup error:', error);
            await Swal.fire({
                icon: 'error',
                title: 'Authenticator setup failed',
                text: error.message || 'Try again.',
                confirmButtonColor: '#102A43'
            });
        } finally {
            setButtonBusy(setupBtn, false);
        }
    }

    async function confirmarConfiguracionMfa(setupData) {
        const apiBase = obtenerApiBase();
        const token = obtenerToken();
        const qrMarkup = setupData.qrDataUrl
            ? `<img class="mfa-setup-qr" src="${escapeHtml(setupData.qrDataUrl)}" alt="Microsoft Authenticator QR code">`
            : '';

        const result = await Swal.fire({
            title: '',
            html: `
                <div class="mfa-modal-shell">
                    <header class="mfa-modal-titlebar">
                        <h2>Set up Microsoft Authenticator</h2>
                    </header>
                    <div class="mfa-modal-banner">
                        <span class="mfa-modal-icon"><i class="fa-solid fa-mobile-screen-button"></i></span>
                        <div>
                            <strong>Microsoft Authenticator</strong>
                            <small>Extra sign-in verification</small>
                        </div>
                    </div>
                    <p class="mfa-modal-lead">Scan this QR code with Microsoft Authenticator, then enter the 6-digit code to finish setup.</p>
                    <div class="mfa-qr-panel">${qrMarkup}</div>
                    <div class="mfa-setup-secret">
                        <span>Manual setup key</span>
                        <strong>${escapeHtml(setupData.secret || '')}</strong>
                    </div>
                    <label class="mfa-field-label" for="mfaConfirmCode">Authentication code</label>
                    <input
                        id="mfaConfirmCode"
                        class="mfa-modal-input mfa-code-input"
                        inputmode="numeric"
                        maxlength="6"
                        placeholder="000000"
                    >
                </div>
            `,
            confirmButtonText: 'Enable authenticator',
            cancelButtonText: 'Cancel',
            showCancelButton: true,
            showCloseButton: true,
            buttonsStyling: false,
            customClass: {
                popup: 'mfa-swal mfa-swal-setup',
                title: 'mfa-swal-title',
                htmlContainer: 'mfa-swal-html',
                actions: 'mfa-swal-actions',
                confirmButton: 'mfa-swal-confirm',
                cancelButton: 'mfa-swal-cancel',
                closeButton: 'mfa-swal-close'
            },
            focusConfirm: false,
            showLoaderOnConfirm: true,
            didOpen: () => {
                document.getElementById('mfaConfirmCode')?.focus();
            },
            preConfirm: async () => {
                const code = String(document.getElementById('mfaConfirmCode')?.value || '').replace(/\D/g, '');

                if (!/^\d{6}$/.test(code)) {
                    Swal.showValidationMessage('Enter the 6-digit authenticator code.');
                    return false;
                }

                try {
                    const response = await fetch(`${apiBase}/auth/mfa/confirm`, {
                        method: 'POST',
                        credentials: 'include',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`
                        },
                        body: JSON.stringify({ code })
                    });
                    const data = await response.json().catch(() => ({}));

                    if (!response.ok || data.error) {
                        throw new Error(data.mensaje || data.message || 'The code could not be verified.');
                    }

                    return data;
                } catch (error) {
                    Swal.showValidationMessage(error.message || 'The code could not be verified.');
                    return false;
                }
            }
        });

        if (!result.isConfirmed || !result.value) return;

        state.usuario = result.value.usuario;
        localStorage.setItem('usuario', JSON.stringify(result.value.usuario));
        renderPerfil(result.value.usuario);

        await Swal.fire({
            icon: 'success',
            title: 'Authenticator enabled',
            text: 'Your next sign-in will ask for a Microsoft Authenticator code.',
            timer: 1800,
            showConfirmButton: false
        });
    }

    async function desactivarMfa() {
        const apiBase = obtenerApiBase();
        const token = obtenerToken();

        const result = await Swal.fire({
            title: '',
            html: `
                <div class="mfa-modal-shell mfa-modal-shell-danger">
                    <header class="mfa-modal-titlebar">
                        <h2>Disable Microsoft Authenticator</h2>
                    </header>
                    <div class="mfa-modal-banner">
                        <span class="mfa-modal-icon mfa-modal-icon-danger"><i class="fa-solid fa-shield-halved"></i></span>
                        <div>
                            <strong>Turn off protection</strong>
                            <small>Verification required</small>
                        </div>
                    </div>
                    <p class="mfa-modal-lead">Confirm your password and current authenticator code before disabling this extra security layer.</p>
                    <label class="mfa-field-label" for="mfaDisablePassword">Current password</label>
                    <input id="mfaDisablePassword" class="mfa-modal-input" type="password" placeholder="Enter your current password">
                    <label class="mfa-field-label" for="mfaDisableCode">Authenticator code</label>
                    <input id="mfaDisableCode" class="mfa-modal-input mfa-code-input" inputmode="numeric" maxlength="6" placeholder="000000">
                </div>
            `,
            confirmButtonText: 'Disable authenticator',
            cancelButtonText: 'Cancel',
            showCancelButton: true,
            showCloseButton: true,
            buttonsStyling: false,
            customClass: {
                popup: 'mfa-swal mfa-swal-danger',
                title: 'mfa-swal-title',
                htmlContainer: 'mfa-swal-html',
                actions: 'mfa-swal-actions',
                confirmButton: 'mfa-swal-danger-confirm',
                cancelButton: 'mfa-swal-cancel',
                closeButton: 'mfa-swal-close'
            },
            focusConfirm: false,
            showLoaderOnConfirm: true,
            didOpen: () => {
                document.getElementById('mfaDisablePassword')?.focus();
            },
            preConfirm: async () => {
                const password = document.getElementById('mfaDisablePassword')?.value || '';
                const code = String(document.getElementById('mfaDisableCode')?.value || '').replace(/\D/g, '');

                if (!password || !/^\d{6}$/.test(code)) {
                    Swal.showValidationMessage('Enter your password and 6-digit code.');
                    return false;
                }

                try {
                    const response = await fetch(`${apiBase}/auth/mfa/disable`, {
                        method: 'POST',
                        credentials: 'include',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`
                        },
                        body: JSON.stringify({ password, code })
                    });
                    const data = await response.json().catch(() => ({}));

                    if (!response.ok || data.error) {
                        throw new Error(data.mensaje || data.message || 'Authenticator could not be disabled.');
                    }

                    return data;
                } catch (error) {
                    Swal.showValidationMessage(error.message || 'Authenticator could not be disabled.');
                    return false;
                }
            }
        });

        if (!result.isConfirmed || !result.value) return;

        state.usuario = result.value.usuario;
        localStorage.setItem('usuario', JSON.stringify(result.value.usuario));
        renderPerfil(result.value.usuario);

        await Swal.fire({
            icon: 'success',
            title: 'Authenticator disabled',
            text: 'Your account no longer asks for an authenticator code.',
            timer: 1600,
            showConfirmButton: false
        });
    }

    function manejarCambioFoto(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        const tiposPermitidos = new Set(['image/jpeg', 'image/png', 'image/webp']);

        if (!tiposPermitidos.has(file.type)) {
            event.target.value = '';
            Swal.fire({
                icon: 'warning',
                title: 'Unsupported format',
                text: 'Choose a JPG, PNG, or WebP image.',
                confirmButtonColor: '#102A43'
            });
            return;
        }

        if (file.size > 3 * 1024 * 1024) {
            event.target.value = '';
            Swal.fire({
                icon: 'warning',
                title: 'Image is too large',
                text: 'The photo cannot exceed 3 MB.',
                confirmButtonColor: '#102A43'
            });
            return;
        }

        limpiarFotoTemporal();
        state.originalPhoto = file;
        state.selectedPhoto = file;
        state.previewObjectUrl = URL.createObjectURL(file);
        state.cropObjectUrl = state.previewObjectUrl;
        state.cropImageReady = false;

        renderAvatarPreview({
            ...state.usuario,
            nombre: document.getElementById('profileName')?.value || state.usuario?.nombre,
            foto_perfil_url: state.previewObjectUrl
        });

        mostrarEditorFoto();
    }

    function mostrarEditorFoto() {
        const panel = document.getElementById('profileCropPanel');
        const image = document.getElementById('profileCropImage');
        const zoom = document.getElementById('profileCropZoom');
        const closeButton = document.getElementById('profileCropCancelBtn');

        if (!panel || !image || !state.cropObjectUrl) return;

        state.crop = { zoom: 1, x: 0, y: 0 };
        state.lastFocusedElement = document.activeElement;
        if (zoom) zoom.value = '1';
        image.src = state.cropObjectUrl;
        panel.hidden = false;
        document.body.classList.add('profile-crop-open');

        window.setTimeout(function () {
            actualizarVistaRecorte();
            closeButton?.focus();
        }, 0);
    }

    function ocultarEditorFoto(restoreFocus = false) {
        const panel = document.getElementById('profileCropPanel');
        const image = document.getElementById('profileCropImage');

        if (panel) panel.hidden = true;
        document.body.classList.remove('profile-crop-open');
        if (image) {
            image.removeAttribute('src');
            image.style.transform = '';
            image.style.width = '';
            image.style.height = '';
        }
        state.cropImageReady = false;
        state.drag = null;

        if (restoreFocus && state.lastFocusedElement?.focus) {
            state.lastFocusedElement.focus();
        }

        state.lastFocusedElement = null;
    }

    function centrarRecorte() {
        const zoom = document.getElementById('profileCropZoom');
        state.crop = { zoom: 1, x: 0, y: 0 };
        if (zoom) zoom.value = '1';
        actualizarVistaRecorte();
    }

    function obtenerMedidasRecorte(stageSize) {
        const image = document.getElementById('profileCropImage');
        if (!image?.naturalWidth || !image?.naturalHeight) return null;

        const imageRatio = image.naturalWidth / image.naturalHeight;
        const baseWidth = imageRatio >= 1 ? stageSize * imageRatio : stageSize;
        const baseHeight = imageRatio >= 1 ? stageSize : stageSize / imageRatio;
        const scaledWidth = baseWidth * state.crop.zoom;
        const scaledHeight = baseHeight * state.crop.zoom;
        const maxX = Math.max(0, (scaledWidth - stageSize) / 2);
        const maxY = Math.max(0, (scaledHeight - stageSize) / 2);

        return {
            imageRatio,
            baseWidth,
            baseHeight,
            scaledWidth,
            scaledHeight,
            maxX,
            maxY,
            offsetX: (state.crop.x / 100) * maxX,
            offsetY: (state.crop.y / 100) * maxY
        };
    }

    function actualizarVistaRecorte() {
        const image = document.getElementById('profileCropImage');
        const stage = document.getElementById('profileCropStage');
        if (!image || !stage || !state.cropImageReady) return;

        const stageRect = stage.getBoundingClientRect();
        const stageSize = Math.max(1, Math.min(stageRect.width, stageRect.height));
        const metrics = obtenerMedidasRecorte(stageSize);
        if (!metrics) return;

        image.style.width = `${metrics.baseWidth}px`;
        image.style.height = `${metrics.baseHeight}px`;
        image.style.transform = [
            'translate(-50%, -50%)',
            `translate(${metrics.offsetX}px, ${metrics.offsetY}px)`,
            `scale(${state.crop.zoom})`
        ].join(' ');
    }

    function iniciarArrastreRecorte(event) {
        if (!state.cropImageReady || event.button !== 0) return;
        const stage = document.getElementById('profileCropStage');
        const metrics = obtenerMedidasRecorte(
            Math.min(stage.getBoundingClientRect().width, stage.getBoundingClientRect().height)
        );
        if (!metrics) return;

        stage.setPointerCapture?.(event.pointerId);
        state.drag = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            cropX: state.crop.x,
            cropY: state.crop.y,
            maxX: metrics.maxX,
            maxY: metrics.maxY
        };
    }

    function moverRecorte(event) {
        if (!state.drag || state.drag.pointerId !== event.pointerId) return;

        const deltaX = event.clientX - state.drag.startX;
        const deltaY = event.clientY - state.drag.startY;
        state.crop.x = limitarPorcentaje(
            state.drag.cropX + (state.drag.maxX ? (deltaX / state.drag.maxX) * 100 : 0)
        );
        state.crop.y = limitarPorcentaje(
            state.drag.cropY + (state.drag.maxY ? (deltaY / state.drag.maxY) * 100 : 0)
        );
        actualizarVistaRecorte();
    }

    function terminarArrastreRecorte(event) {
        if (!state.drag || state.drag.pointerId !== event.pointerId) return;
        state.drag = null;
    }

    function limitarPorcentaje(value) {
        return Math.max(-100, Math.min(100, Number(value) || 0));
    }

    async function aplicarRecorteFoto() {
        const image = document.getElementById('profileCropImage');
        if (!image?.naturalWidth || !state.originalPhoto) return;

        try {
            const canvas = document.createElement('canvas');
            canvas.width = CROP_SIZE;
            canvas.height = CROP_SIZE;
            const context = canvas.getContext('2d');
            const metrics = obtenerMedidasRecorte(CROP_SIZE);
            if (!context || !metrics) return;

            context.clearRect(0, 0, CROP_SIZE, CROP_SIZE);
            context.drawImage(
                image,
                (CROP_SIZE - metrics.scaledWidth) / 2 + metrics.offsetX,
                (CROP_SIZE - metrics.scaledHeight) / 2 + metrics.offsetY,
                metrics.scaledWidth,
                metrics.scaledHeight
            );

            const blob = await new Promise((resolve) => {
                canvas.toBlob(resolve, 'image/jpeg', 0.92);
            });

            if (!blob) throw new Error('The framed photo could not be prepared.');

            const croppedFile = new File([blob], 'profile-photo.jpg', {
                type: 'image/jpeg',
                lastModified: Date.now()
            });

            if (state.previewObjectUrl && state.previewObjectUrl !== state.cropObjectUrl) {
                URL.revokeObjectURL(state.previewObjectUrl);
            }

            state.selectedPhoto = croppedFile;
            state.previewObjectUrl = URL.createObjectURL(croppedFile);
            renderAvatarPreview({
                ...state.usuario,
                nombre: document.getElementById('profileName')?.value || state.usuario?.nombre,
                foto_perfil_url: state.previewObjectUrl
            });
            ocultarEditorFoto();
        } catch (error) {
            await Swal.fire({
                icon: 'error',
                title: 'Photo could not be framed',
                text: error.message || 'Try another image.',
                confirmButtonColor: '#102A43'
            });
        }
    }

    async function guardarPerfil(event) {
        event.preventDefault();

        const apiBase = obtenerApiBase();
        const token = obtenerToken();
        const saveBtn = document.getElementById('profileSaveBtn');
        const nombre = document.getElementById('profileName')?.value.trim() || '';
        const passwordActual = document.getElementById('currentPassword')?.value || '';
        const passwordNueva = document.getElementById('newPassword')?.value || '';
        const passwordConfirmacion = document.getElementById('confirmPassword')?.value || '';
        const cambiaPassword = Boolean(passwordActual || passwordNueva || passwordConfirmacion);

        if (!apiBase || !token) {
            await Swal.fire({
                icon: 'error',
                title: 'Session unavailable',
                text: 'Sign in again to save changes.',
                confirmButtonColor: '#102A43'
            });
            return;
        }

        if (nombre.length < 2) {
            await Swal.fire({
                icon: 'warning',
                title: 'Full name required',
                text: 'Enter your full name.',
                confirmButtonColor: '#102A43'
            });
            return;
        }

        if (cambiaPassword) {
            if (!passwordActual || !passwordNueva || !passwordConfirmacion) {
                await Swal.fire({
                    icon: 'warning',
                    title: 'Complete password fields',
                    text: 'Fill in all three password fields to change it.',
                    confirmButtonColor: '#102A43'
                });
                return;
            }

            if (passwordNueva.length < 6) {
                await Swal.fire({
                    icon: 'warning',
                    title: 'Password is too short',
                    text: 'The new password must have at least 6 characters.',
                    confirmButtonColor: '#102A43'
                });
                return;
            }

            if (passwordNueva !== passwordConfirmacion) {
                await Swal.fire({
                    icon: 'warning',
                    title: 'Passwords do not match',
                    text: 'The confirmation must match the new password.',
                    confirmButtonColor: '#102A43'
                });
                return;
            }
        }

        const formData = new FormData();
        formData.append('nombre', nombre);

        if (state.selectedPhoto) {
            formData.append('foto', state.selectedPhoto);
        }

        if (cambiaPassword) {
            formData.append('password_actual', passwordActual);
            formData.append('password_nueva', passwordNueva);
            formData.append('password_confirmacion', passwordConfirmacion);
        }

        setSaving(true, saveBtn);

        try {
            const response = await fetch(`${apiBase}/auth/profile`, {
                method: 'PUT',
                credentials: 'include',
                headers: {
                    Authorization: `Bearer ${token}`
                },
                body: formData
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok || data.error) {
                throw new Error(data.mensaje || data.message || 'Profile could not be saved.');
            }

            state.usuario = data.usuario;
            localStorage.setItem('usuario', JSON.stringify(data.usuario));
            limpiarPasswords();
            limpiarFotoTemporal();
            ocultarEditorFoto();
            document.getElementById('profilePhoto').value = '';
            renderPerfil(data.usuario);

            if (typeof window.cargarInfoUser === 'function') {
                window.cargarInfoUser();
            }

            await Swal.fire({
                icon: 'success',
                title: 'Profile updated',
                text: data.mensaje || data.message || 'Your changes were saved.',
                timer: 1500,
                showConfirmButton: false
            });
        } catch (error) {
            console.error('Error saving profile:', error);
            await Swal.fire({
                icon: 'error',
                title: 'Could not save',
                text: error.message || 'Try again.',
                confirmButtonColor: '#102A43'
            });
        } finally {
            setSaving(false, saveBtn);
        }
    }

    function limpiarPasswords() {
        setValue('currentPassword', '');
        setValue('newPassword', '');
        setValue('confirmPassword', '');
    }

    function limpiarFotoTemporal() {
        state.selectedPhoto = null;
        state.originalPhoto = null;

        const urls = new Set([state.previewObjectUrl, state.cropObjectUrl].filter(Boolean));
        urls.forEach((url) => URL.revokeObjectURL(url));
        state.previewObjectUrl = '';
        state.cropObjectUrl = '';
        state.cropImageReady = false;
        state.drag = null;
    }

    function setSaving(isSaving, button) {
        if (!button) return;

        button.disabled = isSaving;
        button.innerHTML = isSaving
            ? '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>Saving...'
            : '<i class="fa-solid fa-floppy-disk" aria-hidden="true"></i>Save changes';
    }
})();

