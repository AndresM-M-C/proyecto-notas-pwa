if ('serviceWorker' in navigator) { navigator.serviceWorker.register('sw.js'); }

const urlParams = new URLSearchParams(window.location.search);
const tokenUrl = urlParams.get('recoverToken');

let currentMode = tokenUrl ? 'reset' : 'login';
const formTitle = document.getElementById('formTitle');
const btnAction = document.getElementById('btnAction');
const linkToggle = document.getElementById('linkToggle');
const linkRecover = document.getElementById('linkRecover');
const msg = document.getElementById('msg');

if(currentMode === 'reset') {
    if(formTitle) formTitle.textContent = "Nueva Contraseña";
    if(btnAction) btnAction.textContent = "Cambiar Contraseña";
    document.getElementById('nombre').style.display = 'none';
}

if(linkToggle) {
    linkToggle.onclick = () => {
        currentMode = currentMode === 'login' ? 'register' : 'login';
        formTitle.textContent = currentMode === 'login' ? "Iniciar Sesión" : "Registrarse";
        btnAction.textContent = currentMode === 'login' ? "Iniciar sesión" : "Crear Cuenta";
        hideMessage();
    };
}

if(linkRecover) {
    linkRecover.onclick = () => {
        currentMode = 'recover';
        formTitle.textContent = "Recuperar Cuenta";
        btnAction.textContent = "Enviar Correo";
        document.getElementById('password').style.display = 'none';
        hideMessage();
    };
}

function showMessage(text) {
    if(msg) {
        msg.textContent = text;
        msg.classList.remove('hidden');
    }
}

function hideMessage() {
    if(msg) msg.classList.add('hidden');
}

btnAction.onclick = async () => {
    hideMessage();
    const email = document.getElementById('nombre').value;
    const password = document.getElementById('password').value;
    
    let endpoint = `/api/${currentMode}`;
    let payload = { email, password };

    if(currentMode === 'reset') {
        endpoint = '/api/reset-password';
        payload = { token: tokenUrl, newPassword: password };
    }

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        
        if(!res.ok) {
            showMessage(data.error || "Ocurrió un error.");
        } else {
            showMessage(data.message);
            
            if(currentMode === 'reset') {
                setTimeout(() => {
                    currentMode = 'login';
                    if(formTitle) formTitle.textContent = "Iniciar Sesión";
                    if(btnAction) btnAction.textContent = "Iniciar sesión";
                    
                    document.getElementById('nombre').style.display = 'block';
                    document.getElementById('password').style.display = 'block';
                    document.getElementById('nombre').value = '';
                    document.getElementById('password').value = '';
                    
                    window.history.replaceState({}, document.title, window.location.pathname);
                    
                    hideMessage();
                }, 3000); 
            }
            
            if(currentMode === 'login') {
                localStorage.setItem('userId', data.userId);
                window.location.href = 'inicio.html';
            }
        }
    } catch(e) {
        showMessage("Error de conexión asíncrona.");
    }
};