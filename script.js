/**
 * Application de Gestion des Invités avec Google Sheets
 * Version finale - intégration complète avec Google Sheets
 */

// Configuration Airtable
const AIRTABLE_API_KEY = 'patWNDTQ0bIhzuz5o.9e6077761b540a1d8af475194055de5d397db0acb7a60593c3eeaf1bbe951d10';
const AIRTABLE_BASE_ID = 'appvmxyJml5pHuoaM';
const AIRTABLE_TABLE_NAME = 'Invites';

// Variables globales
let guests = [];
let filteredGuests = [];
let currentPage = 'guests';
let isOnline = navigator.onLine;

// Initialisation de l'application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    setupEventListeners();
    showLoadingState();
    
    // Charger les données depuis Airtable
    loadGuestsFromAirtable()
        .then(() => {
            hideLoadingState();
        
            displayGuests();
            updateStats();
            updateLastSyncTime();
        })
        .catch(error => {
            console.error('Erreur lors du chargement:', error);
            hideLoadingState();
            updateSyncStatus('offline');
            
            showNotification('Impossible de se connecter à Airtable. Vérifiez votre connexion internet.', 'error');
            
            // Afficher un message d'erreur dans la grille
            const guestsGrid = document.getElementById('guestsGrid');
            guestsGrid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #e74c3c;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 3em; margin-bottom: 20px;"></i>
                    <h3>Connexion impossible</h3>
                    <p>Vérifiez votre connexion internet et rechargez la page</p>
                    <button onclick="window.location.reload()" class="nav-btn" style="margin-top: 20px;">
                        <i class="fas fa-refresh"></i> Recharger
                    </button>
                </div>
            `;
        });
    
    // Écouter les changements de connexion
    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOfflineStatus);
    
    // Mettre à jour le statut de connexion initial
    updateSyncStatus(isOnline ? 'online' : 'offline');
}

function setupEventListeners() {
    // Navigation
    document.getElementById('guestsBtn').addEventListener('click', () => showPage('guests'));
    document.getElementById('statsBtn').addEventListener('click', () => showPage('stats'));
    
    // Recherche et filtres
    document.getElementById('searchInput').addEventListener('input', filterGuests);
    document.getElementById('tableFilter').addEventListener('change', filterGuests);
    document.getElementById('statusFilter').addEventListener('change', filterGuests);
}

// ==================== FONCTIONS GOOGLE SHEETS ====================

/**
 * Charge tous les invités depuis Airtable
 */
async function loadGuestsFromAirtable() {
    try {
        const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}`, {
            headers: {
                'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        // Transformer les données Airtable en format de l'app
        guests = result.records.map(record => ({
            id: record.id,
            name: record.fields.nom || '',
            table: record.fields.table || 1,
            tableName: `Table ${record.fields.table || 1}`, // Générer automatiquement
            present: record.fields.present || false,
            phone: '', // Pas utilisé
            email: ''  // Pas utilisé
        }));
        
        filteredGuests = [...guests];
        updateSyncStatus('online');
        
        console.log(`✅ ${guests.length} invités chargés depuis Airtable`);
        return guests;
    } catch (error) {
        console.error('Erreur lors du chargement depuis Airtable:', error);
        updateSyncStatus('offline');
        throw error;
    }
}

/**
 * Met à jour un invité dans Airtable
 */
async function updateGuestInAirtable(guest) {
    try {
        const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}/${guest.id}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fields: {
                    'nom': guest.name,
                    'table': guest.table,
                    'present': guest.present
                },
                typecast: true
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('✅ Invité mis à jour dans Airtable:', guest.name);
        updateLastSyncTime();
        return true;
    } catch (error) {
        console.error('Erreur lors de la mise à jour:', error);
        throw error;
    }
}

/**
 * Ajoute un nouvel invité dans Airtable
 */
async function addGuestToAirtable(guest) {
    try {
        const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fields: {
                    'nom': guest.name,
                    'table': guest.table,
                    'present': guest.present || false
                },
                typecast: true
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('✅ Invité ajouté dans Airtable:', guest.name);
        updateLastSyncTime();
        
        // Retourner l'invité avec l'ID Airtable
        return {
            ...guest,
            id: result.id
        };
    } catch (error) {
        console.error('Erreur lors de l\'ajout:', error);
        throw error;
    }
}

// ==================== GESTION CONNEXION ====================

function handleOnlineStatus() {
    isOnline = true;
    console.log('🌐 Connexion rétablie');
    updateSyncStatus('online');
    showNotification('Connexion rétablie', 'success');
}

function handleOfflineStatus() {
    isOnline = false;
    console.log('📴 Connexion perdue');
    updateSyncStatus('offline');
    showNotification('Connexion internet perdue', 'error');
}

// ==================== FONCTIONS UI ====================

function showPage(page) {
    // Masquer toutes les pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    
    // Afficher la page sélectionnée
    document.getElementById(page + 'Page').classList.add('active');
    document.getElementById(page + 'Btn').classList.add('active');
    
    currentPage = page;
    
    if (page === 'stats') {
        updateStats();
        displayTablesStats();
    }
}

// Cette fonction n'est plus utilisée car on a supprimé les filtres

function filterGuests() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    
    filteredGuests = guests.filter(guest => {
        return guest.name.toLowerCase().includes(searchTerm);
    });
    
    displayGuests();
}

function displayGuests() {
    const tablesContainer = document.getElementById('tablesContainer');
    tablesContainer.innerHTML = '';
    
    if (filteredGuests.length === 0) {
        tablesContainer.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #666;">
                <i class="fas fa-search" style="font-size: 3em; margin-bottom: 20px; opacity: 0.5;"></i>
                <h3>Aucun invité trouvé</h3>
                <p>Essayez de modifier votre recherche</p>
            </div>
        `;
        return;
    }
    
    // Grouper les invités par table
    const guestsByTable = {};
    filteredGuests.forEach(guest => {
        const tableNum = guest.table;
        if (!guestsByTable[tableNum]) {
            guestsByTable[tableNum] = [];
        }
        guestsByTable[tableNum].push(guest);
    });
    
    // Trier les tables par numéro
    const sortedTables = Object.keys(guestsByTable).sort((a, b) => parseInt(a) - parseInt(b));
    
    // Afficher chaque table
    sortedTables.forEach(tableNum => {
        const tableGuests = guestsByTable[tableNum];
        const presentCount = tableGuests.filter(g => g.present).length;
        const totalCount = tableGuests.length;
        
        const tableSection = document.createElement('div');
        tableSection.className = 'table-section';
        
        tableSection.innerHTML = `
            <div class="table-header">
                <div class="table-title">
                    <i class="fas fa-table"></i>
                    <h3>Table ${tableNum}</h3>
                </div>
                <div class="table-stats">
                    <span class="present-count">${presentCount}</span>
                    <span class="separator">/</span>
                    <span class="total-count">${totalCount}</span>
                    <span class="label">présents</span>
                </div>
            </div>
            <div class="guests-grid">
                ${tableGuests.map(guest => createGuestCardHTML(guest)).join('')}
            </div>
        `;
        
        tablesContainer.appendChild(tableSection);
    });
}

function createGuestCardHTML(guest) {
    return `
        <div class="guest-card">
            <div class="guest-header">
                <div class="guest-name">${guest.name}</div>
                <span class="status-badge ${guest.present ? 'present' : 'absent'}">
                    ${guest.present ? 'Présent' : 'Absent'}
                </span>
            </div>
            ${guest.present ? 
                `<div class="presence-locked">
                    <i class="fas fa-lock"></i>
                    <span>Présence confirmée</span>
                </div>` :
                `<button class="toggle-presence absent" 
                        onclick="togglePresence('${guest.id}')"
                        ${!isOnline ? 'disabled title="Connexion internet requise"' : ''}>
                    <i class="fas fa-check"></i>
                    Marquer comme Présent
                </button>`
            }
        </div>
    `;
}

function createGuestCard(guest) {
    const card = document.createElement('div');
    card.className = 'guest-card';
    card.innerHTML = createGuestCardHTML(guest);
    return card;
}

async function togglePresence(guestId) {
    const guest = guests.find(g => g.id === guestId);
    if (!guest) return;
    
    // Si l'invité est déjà présent, ne rien faire
    if (guest.present) {
        showNotification(`${guest.name} est déjà marqué(e) comme présent(e) ✅`, 'info');
        return;
    }
    
    // Vérifier la connexion internet
    if (!isOnline) {
        showNotification('Connexion internet requise pour modifier les statuts', 'error');
        return;
    }
    
    const oldPresent = guest.present;
    guest.present = true; // Seulement absent -> présent possible
    
    // Mettre à jour l'affichage immédiatement
    displayGuests();
    updateStats();
    
    // Synchroniser avec Airtable
    try {
        await updateGuestInAirtable(guest);
        showNotification(`🎉 ${guest.name} marqué(e) comme présent(e) !`, 'success');
    } catch (error) {
        // Annuler le changement en cas d'erreur
        guest.present = oldPresent;
        displayGuests();
        updateStats();
        
        console.error('Erreur lors de la mise à jour:', error);
        showNotification(`Erreur lors de la mise à jour. Vérifiez votre connexion.`, 'error');
    }
}

function updateStats() {
    const totalGuests = guests.length;
    const presentGuests = guests.filter(g => g.present).length;
    const absentGuests = totalGuests - presentGuests;
    const attendanceRate = totalGuests > 0 ? Math.round((presentGuests / totalGuests) * 100) : 0;
    
    document.getElementById('totalGuests').textContent = totalGuests;
    document.getElementById('presentGuests').textContent = presentGuests;
    document.getElementById('absentGuests').textContent = absentGuests;
    document.getElementById('attendanceRate').textContent = attendanceRate + '%';
}

function displayTablesStats() {
    const tablesStatsGrid = document.getElementById('tablesStatsGrid');
    const tables = [...new Set(guests.map(guest => guest.table))].sort((a, b) => a - b);
    
    tablesStatsGrid.innerHTML = '';
    
    tables.forEach(tableNum => {
        const tableGuests = guests.filter(g => g.table === tableNum);
        const tableName = tableGuests[0]?.tableName || `Table ${tableNum}`;
        const totalInTable = tableGuests.length;
        const presentInTable = tableGuests.filter(g => g.present).length;
        const attendancePercentage = totalInTable > 0 ? (presentInTable / totalInTable) * 100 : 0;
        
        const tableCard = document.createElement('div');
        tableCard.className = 'table-stat-card';
        tableCard.innerHTML = `
            <h4>Table ${tableNum}</h4>
            <p style="color: #666; margin-bottom: 10px; font-size: 0.9em;">${tableName}</p>
            <div style="font-size: 1.5em; font-weight: bold; color: #764ba2; margin: 10px 0;">
                ${presentInTable}/${totalInTable}
            </div>
            <div class="table-progress">
                <div class="table-progress-fill" style="width: ${attendancePercentage}%"></div>
            </div>
            <p style="color: #666; font-size: 0.9em;">${Math.round(attendancePercentage)}% présents</p>
        `;
        
        tablesStatsGrid.appendChild(tableCard);
    });
}

// ==================== FONCTIONS UTILITAIRES ====================

function showLoadingState() {
    const guestsGrid = document.getElementById('guestsGrid');
    guestsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #666;">
            <i class="fas fa-spinner fa-spin" style="font-size: 3em; margin-bottom: 20px; color: #764ba2;"></i>
            <h3>Chargement des invités...</h3>
            <p>Connexion à Google Sheets en cours</p>
        </div>
    `;
}

function hideLoadingState() {
    // Le contenu sera remplacé par displayGuests()
}

function updateSyncStatus(status) {
    const syncStatus = document.getElementById('syncStatus');
    const syncIcon = document.getElementById('syncIcon');
    const syncText = document.getElementById('syncText');
    const onlineStatus = document.getElementById('onlineStatus');
    
    // Réinitialiser les classes
    syncStatus.className = 'sync-status';
    onlineStatus.className = 'status-indicator';
    
    switch (status) {
        case 'online':
            syncStatus.classList.add('online');
            syncIcon.className = 'fas fa-cloud';
            syncText.textContent = 'Synchronisé';
            onlineStatus.innerHTML = '<i class="fas fa-wifi"></i><span>En ligne</span>';
            break;
        case 'offline':
            syncStatus.classList.add('offline');
            syncIcon.className = 'fas fa-cloud-slash';
            syncText.textContent = 'Hors ligne';
            onlineStatus.classList.add('offline');
            onlineStatus.innerHTML = '<i class="fas fa-wifi-slash"></i><span>Hors ligne</span>';
            break;
        case 'syncing':
            syncStatus.classList.add('syncing');
            syncIcon.className = 'fas fa-sync-alt';
            syncText.textContent = 'Synchronisation...';
            break;
    }
}



function updateLastSyncTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('fr-FR');
    document.getElementById('lastSyncTime').textContent = timeString;
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    const colors = {
        success: '#2ecc71',
        warning: '#f39c12',
        error: '#e74c3c',
        info: '#3498db'
    };
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${colors[type] || colors.success};
        color: white;
        padding: 15px 20px;
        border-radius: 10px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
        max-width: 300px;
    `;
    
    const icons = {
        success: 'fas fa-check-circle',
        warning: 'fas fa-exclamation-triangle',
        error: 'fas fa-times-circle',
        info: 'fas fa-info-circle'
    };
    
    notification.innerHTML = `<i class="${icons[type] || icons.success}"></i> ${message}`;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 4000);
}



// ==================== FONCTIONS AVANCÉES ====================

/**
 * Force une synchronisation complète
 */
async function forceSync() {
    if (!isOnline) {
        showNotification('Connexion internet requise', 'error');
        return;
    }
    
    try {
        updateSyncStatus('syncing');
        showNotification('Synchronisation en cours...', 'warning');
        
        await loadGuestsFromAirtable();
        
    
        displayGuests();
        updateStats();
        
        showNotification('Synchronisation terminée avec succès', 'success');
        updateSyncStatus('online');
    } catch (error) {
        console.error('Erreur lors de la synchronisation forcée:', error);
        showNotification('Erreur lors de la synchronisation', 'error');
        updateSyncStatus('offline');
    }
}



// Raccourcis clavier utiles
document.addEventListener('keydown', function(e) {
    // Ctrl/Cmd + F pour focus sur la recherche
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        document.getElementById('searchInput').focus();
    }
    
    // Échap pour vider la recherche
    if (e.key === 'Escape') {
        document.getElementById('searchInput').value = '';
        document.getElementById('tableFilter').value = '';
        document.getElementById('statusFilter').value = '';
        filterGuests();
    }
});

// Ajouter les styles d'animation
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    
    .fa-spinner, .fa-sync-alt.fa-spin {
        animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);

console.log('✅ Application de gestion des invités avec Google Sheets initialisée');
console.log('🌐 Statut connexion:', isOnline ? 'En ligne' : 'Hors ligne');
console.log('⚠️  N\'oubliez pas de configurer GOOGLE_SCRIPT_URL avec votre URL de déploiement!');