const roleSelect = document.getElementById("role-select");

roleSelect?.addEventListener("change", () => {
    const url = new URL(window.location.href);
    url.searchParams.set("role", roleSelect.value);
    window.location.assign(url);
});

