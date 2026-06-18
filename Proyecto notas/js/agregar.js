const notaEditar = JSON.parse(localStorage.getItem("notaEditar"));
const formNoteTitle = document.getElementById("formNoteTitle");

if (notaEditar) {
    if (formNoteTitle) formNoteTitle.textContent = "Editar Nota";
    document.getElementById("titulo").value = notaEditar.title;
    document.getElementById("descripcion").value = notaEditar.content;
    if (notaEditar.color) {
        document.getElementById("color").value = notaEditar.color;
    }
}

document.getElementById('btn-cancelar').onclick = () => {
    localStorage.removeItem("notaEditar");
    window.location.href = "inicio.html";
};

document.getElementById('btn-guardar').onclick = async () => {
    const title = document.getElementById('titulo').value;
    const content = document.getElementById('descripcion').value;
    const color = document.getElementById('color').value; 
    const userId = localStorage.getItem('userId');

    if (!title || !content) return alert("Por favor, llena los campos.");

    let url = '/api/notes';
    let method = 'POST'; 
    let bodyData = { title, content, color, userId };

    if (notaEditar && notaEditar.id) {
        url = `/api/notes/${notaEditar.id}`;
        method = 'PUT';
        bodyData = { title, content, color };
    }

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyData)
        });

        if (res.ok) {
            localStorage.removeItem("notaEditar");
            window.location.href = 'inicio.html';
        } else {
            alert("Error al intentar guardar la nota en la base de datos.");
        }
    } catch (err) {
        console.error("Error en la conexión asíncrona con la API:", err);
    }
};