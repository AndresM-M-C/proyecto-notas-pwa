document.addEventListener("DOMContentLoaded", () => {
    const btnRegister = document.getElementById('btnRegister');
    const msg = document.getElementById('msg');

    if (btnRegister) {
        btnRegister.onclick = async () => {
            if(msg) msg.classList.add('hidden');

            const email = document.getElementById('regNombre').value;
            const password = document.getElementById('regPassword').value;

            if(!email || !password) return alert("Por favor, llena todos los campos.");

            btnRegister.disabled = true;
            btnRegister.textContent = "Enviando correo...";
            btnRegister.style.backgroundColor = "#ccc"; 

            try {
                const res = await fetch('/api/register', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ email, password })
                });
                const data = await res.json();
                
                if(msg) {
                    msg.textContent = data.message || data.error;
                    msg.classList.remove('hidden');
                }
            } catch(e) {
                if(msg) {
                    msg.textContent = "Error de conexión asíncrona.";
                    msg.classList.remove('hidden');
                }
            } finally {
                btnRegister.disabled = false;
                btnRegister.textContent = "Registrarse";
                btnRegister.style.backgroundColor = "#2dc7ff";
            }
        };
    }
});