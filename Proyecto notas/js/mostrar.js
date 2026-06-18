async function cargarNotas() {
    const userId = localStorage.getItem('userId');
    if (!userId) window.location.href = "index.html";

    const ul = document.getElementById('listaNotas');
    if (!ul) return;
    ul.innerHTML = "";

    try {
        const res = await fetch('/api/notes', {
            headers: { 'user-id': userId }
        });
        const notas = await res.json();

        notas.forEach(nota => {
            const li = document.createElement("li");
            
            if(nota.color) {
                li.style.backgroundColor = nota.color;
            } else {
                li.style.backgroundColor = '#2dc7ff';
            }

            li.innerHTML = `
            <div class="nota-contenido" style="flex-grow: 1; width: 100%;">
                <h1>${nota.title}</h1>
                <p>${nota.content}</p>
            </div>
            <div>
                <button onclick="eliminarNota(event, ${nota.id})">
                    <i class="bi bi-trash-fill trash"></i>
                    <i class="bi bi-trash trash2"></i>
                </button>
            </div>
            `;
            
            li.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                localStorage.setItem('notaEditar', JSON.stringify(nota));
                window.location.href = "agregar.html";
            });
            
            ul.appendChild(li);
        });
    } catch (error) {
        console.error("Error cargando notas asíncronamente:", error);
    }
}

async function eliminarNota(event, id) {
    event.stopPropagation(); 
    try {
        await fetch(`/api/notes/${id}`, { method: 'DELETE' });
        cargarNotas();
    } catch (err) {
        console.error("Error al eliminar nota:", err);
    }
}

window.onload = cargarNotas;