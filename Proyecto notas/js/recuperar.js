document.addEventListener("DOMContentLoaded", () => {
    const btnAction = document.getElementById('btnAction');
    const msg = document.getElementById('msg');

    if (btnAction) {
        btnAction.onclick = async () => {
            if(msg) msg.classList.add('hidden');
            
            const email = document.getElementById('nombre').value;
            if(!email) return;

            try {
                const res = await fetch('/api/recover', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ email })
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
            }
        };
    }
});