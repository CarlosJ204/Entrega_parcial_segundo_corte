let currentTree = null;
let currentNode = null;
let decisiones = [];
let finalResult = null;

const treeContainer = document.getElementById('tree-container');
const profilesContainer = document.getElementById('profiles-container');
const profilesGrid = document.getElementById('profiles-grid');
const generateLoader = document.getElementById('generate-loader');
const resultsContainer = document.getElementById('results-container');

const btnShowCreate = document.getElementById('btn-show-create');
const createProfileContainer = document.getElementById('create-profile-container');
const btnCancelCreate = document.getElementById('btn-cancel-create');
const createProfileForm = document.getElementById('create-profile-form');

document.addEventListener('DOMContentLoaded', () => {
    fetchTree();
});

async function fetchTree() {
    try {
        const response = await fetch('/api/tree');
        if (!response.ok) throw new Error("Error fetching tree");
        const data = await response.json();
        currentTree = data;
        currentNode = data;
        renderNode();
    } catch (error) {
        console.error(error);
        treeContainer.innerHTML = `<p style="color: red; text-align: center;">Error al cargar el árbol de preferencias. Verifica la conexión con el servidor.</p>`;
    }
}

function renderNode() {
    treeContainer.innerHTML = '';

    if (!currentNode.hijos || currentNode.hijos.length === 0) {
        // We reached a leaf
        finalResult = {
            codigo: "SIN_CODIGO",
            categorias: [currentNode.nombre]
        };
        treeContainer.style.display = 'none';

        // Cargar perfiles
        loadProfiles();
        return;
    }

    if (!currentNode.nombre) {
        treeContainer.innerHTML = '<p>Error: Nodo inválido.</p>';
        return;
    }

    const title = document.createElement('h2');
    title.textContent = currentNode.nombre;
    treeContainer.appendChild(title);

    currentNode.hijos.forEach((hijo, index) => {
        const btn = document.createElement('button');
        btn.className = 'btn btn-option fade-in';
        btn.style.animationDelay = `${index * 0.1}s`;
        btn.textContent = hijo.nombre;
        btn.onclick = () => selectOption(currentNode.nombre, hijo);
        treeContainer.appendChild(btn);
    });
}

function selectOption(pregunta, nodeResponse) {
    decisiones.push(`${pregunta}: ${nodeResponse.nombre}`);
    currentNode = nodeResponse;
    renderNode();
}

async function loadProfiles() {
    profilesContainer.style.display = 'block';
    profilesGrid.innerHTML = '<div class="spinner"></div>';

    try {
        const response = await fetch('/api/profiles');
        if (!response.ok) throw new Error("Error cargando perfiles");
        const perfiles = await response.json();

        profilesGrid.innerHTML = '';
        perfiles.forEach((perfil, index) => {
            const card = document.createElement('div');
            card.className = 'profile-card fade-in';
            card.style.animationDelay = `${index * 0.1}s`;

            // Generar tags HTML
            const tags = perfil.tags;
            let tagsHtml = '';
            if (tags.dias_viaje) tagsHtml += `<span class="profile-tag">⏱️ ${tags.dias_viaje} días</span>`;
            if (tags.precio) tagsHtml += `<span class="profile-tag">💰 ${tags.precio}</span>`;
            if (tags.prefiere_reserva === 'si') tagsHtml += `<span class="profile-tag">🎟️ Con Reserva</span>`;
            if (tags.prefiere_reserva === 'no') tagsHtml += `<span class="profile-tag">🎟️ Sin Reserva</span>`;
            if (tags.prefiere_evento_especial === 'si') tagsHtml += `<span class="profile-tag">⭐ Eventos</span>`;
            if (tags.horario && tags.horario !== 'indiferente') tagsHtml += `<span class="profile-tag">📅 ${tags.horario}</span>`;

            card.innerHTML = `
                <h3>${perfil.nombre}</h3>
                <p>${perfil.descripcion}</p>
                <div class="profile-tags">${tagsHtml}</div>
            `;

            card.onclick = () => selectProfile(perfil.id);
            profilesGrid.appendChild(card);
        });

    } catch (error) {
        console.error(error);
        profilesGrid.innerHTML = `<p style="color: red;">Error al cargar perfiles: ${error.message}</p>`;
    }
}

async function selectProfile(perfilId) {
    profilesContainer.style.display = 'none';
    generateLoader.style.display = 'block';

    const payload = {
        codigo: finalResult.codigo || "SIN_CODIGO",
        categorias: finalResult.categorias || [],
        decisiones: decisiones,
        perfil_id: perfilId
    };

    try {
        const response = await fetch('/api/recommend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Hubo un error intentando obtener las recomendaciones.");

        renderResults(data);
    } catch (error) {
        console.error(error);
        generateLoader.innerHTML = `<p style="color: red;">Ocurrió un error: ${error.message}</p>
        <button class="btn-secondary" onclick="location.reload()">Reintentar</button>`;
    }
}

function renderResults(data) {
    generateLoader.style.display = 'none';
    resultsContainer.style.display = 'block';

    const itineraryContainer = document.getElementById('itinerary-container');
    itineraryContainer.innerHTML = '';

    if (!data.itinerario || data.itinerario.length === 0) {
        itineraryContainer.innerHTML = '<p>No se encontraron planes que cumplan con los filtros del perfil especificado. Intenta seleccionar otro perfil.</p>';
        return;
    }

    data.itinerario.forEach((diaInfo, dayIndex) => {
        const daySection = document.createElement('div');
        daySection.style.width = '100%';
        daySection.className = 'fade-in';
        daySection.style.animationDelay = `${dayIndex * 0.1}s`;

        const dayHeader = document.createElement('h3');
        dayHeader.style.marginTop = dayIndex > 0 ? '2.5rem' : '1rem';
        dayHeader.style.color = 'var(--primary)';
        dayHeader.style.borderBottom = '2px solid var(--secondary)';
        dayHeader.style.paddingBottom = '0.5rem';
        dayHeader.style.marginBottom = '1.5rem';
        dayHeader.textContent = diaInfo.dia || `Día ${dayIndex + 1}`;
        daySection.appendChild(dayHeader);

        if (!diaInfo.planes || diaInfo.planes.length === 0) {
            const noPlans = document.createElement('p');
            noPlans.style.color = 'var(--gray)';
            noPlans.textContent = "No hay actividades programadas para este día que cumplan todos los requisitos.";
            daySection.appendChild(noPlans);
            itineraryContainer.appendChild(daySection);
            return;
        }

        const plansGrid = document.createElement('div');
        plansGrid.className = 'plans-grid';

        diaInfo.planes.forEach((plan) => {
            const el = document.createElement('div');
            el.className = 'plan-card';

            const reqReserva = plan.requiere_reserva ? 'Reserva Obligatoria' : 'Sin Reserva';
            const idiomas = plan.idiomas && plan.idiomas.length > 0 ? plan.idiomas.join(', ') : 'Español';
            const horarios = plan.horarios && plan.horarios.length > 0 ? plan.horarios.join(', ') : 'Indiferente';
            const evento = plan.evento_especial ? `⭐ Evento Especial: ${plan.tipo_evento}` : '';

            el.innerHTML = `
                <h4>${plan.nombre || 'Plan Turístico'}</h4>
                <p>${plan.descripcion || 'Sin descripción'}</p>
                <div class="plan-meta">
                    <span class="badge">💰 Ppto: ${plan.precio || 'N/A'}</span>
                    <span class="badge">📅 ${horarios}</span>
                    <span class="badge">🗣️ ${idiomas}</span>
                    <span class="badge">🎟️ ${reqReserva}</span>
                </div>
                ${evento ? `<p style="margin-top:0.8rem;font-size:0.9rem;font-weight:600;color:var(--primary);">${evento}</p>` : ''}
            `;
            plansGrid.appendChild(el);
        });

        daySection.appendChild(plansGrid);
        itineraryContainer.appendChild(daySection);
    });
}

btnShowCreate.addEventListener('click', () => {
    createProfileContainer.style.display = 'block';
    btnShowCreate.style.display = 'none';
});

btnCancelCreate.addEventListener('click', () => {
    createProfileContainer.style.display = 'none';
    btnShowCreate.style.display = 'inline-block';
});

createProfileForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nombre = document.getElementById('cp-nombre').value;
    const descripcion = document.getElementById('cp-descripcion').value;
    const diasViaje = parseInt(document.getElementById('cp-dias').value);
    const idiomasRaw = document.getElementById('cp-idiomas').value;
    const prefiere_reserva = document.getElementById('cp-reserva').value;
    const horario = document.getElementById('cp-horario').value;
    const prefiere_evento = document.getElementById('cp-evento').value;
    const precio = document.getElementById('cp-presupuesto').value;

    const tags = {
        dias_viaje: diasViaje
    };
    if (idiomasRaw.trim()) {
        tags.idiomas_requeridos = idiomasRaw.split(',').map(i => i.trim().toLowerCase());
    }
    tags.prefiere_reserva = prefiere_reserva;
    if (horario && horario !== "indiferente") tags.horario = horario;
    tags.prefiere_evento_especial = prefiere_evento;
    if (precio && precio !== "indiferente") tags.precio = precio;

    const newProfile = {
        nombre: nombre,
        descripcion: descripcion,
        tags: tags
    };

    try {
        btnShowCreate.textContent = 'Guardando...';
        btnShowCreate.disabled = true;

        const response = await fetch('/api/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newProfile)
        });

        if (!response.ok) throw new Error("Error al crear perfil");

        const data = await response.json();

        createProfileContainer.style.display = 'none';
        btnShowCreate.style.display = 'inline-block';
        btnShowCreate.textContent = '+ Crear mi propio perfil';
        btnShowCreate.disabled = false;
        createProfileForm.reset();

        // Recargar los perfiles
        loadProfiles();

    } catch (error) {
        console.error(error);
        alert("Error: " + error.message);
        btnShowCreate.textContent = '+ Crear mi propio perfil';
        btnShowCreate.disabled = false;
    }
});
