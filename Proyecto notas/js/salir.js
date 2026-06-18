document.addEventListener("DOMContentLoaded", () => {
    const btnSalir = document.getElementById("btn-salir");

    if (btnSalir) {
        btnSalir.onclick = () => {
            localStorage.removeItem('userId');
            window.location.href = 'index.html';
        };
    }
});