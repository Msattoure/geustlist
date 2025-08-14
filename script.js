/**
 * Application de Gestion des Invités avec Google Sheets
 * Version finale - intégration complète avec Google Sheets
 */

// Configuration Google Apps Script
// ⚠️ IMPORTANT: Remplacez cette URL par l'URL de votre déploiement Google Apps Script
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby1fNmzr3ioxa8MGaEQmSyH0zd2rQRQlshZGl1SCiXJE3UNmDtFzJcuqFiKUTzm-Gip/exec';

// Variables globales
let guests = [];
let filteredGuests = [];
let currentPage = 'guests';
let isOnline = navigator.onLine;
let pendingChanges = [];

// Initialisation de l'application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    setupEventListeners();
    showLoadingState();
    
    // Charger les données depuis Google Sheets
    loadGuestsFromSheet()
        .then(() => {
            hideLoadingState();
            populateTableFilter();
            displayGuests();
            updateStats();
            updateLastSyncTime();
        })
        .catch(error => {
            console.error('Erreur lors du chargement:', error);
            hideLoadingState();
            
            // Fallback: charger depuis localStorage si Google Sheets échoue
            loadFromLocalStorage();
            populateTableFilter();
            displayGuests();
            updateStats();
            
            showNotification('Mode hors ligne - Données locales chargées', 'warning');
            updateSyncStatus('offline');
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
 * Charge tous les invités depuis Google Sheets
 */
async function loadGuestsFromSheet() {
    try {
        const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=getAllGuests`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.status === 'success') {
            guests = result.guests || [];
            filteredGuests = [...guests];
            
            // Sauvegarder localement comme backup
            saveToLocalStorage();
            updateSyncStatus('online');
            
            console.log(`✅ ${guests.length} invités chargés depuis Google Sheets`);
            return guests;
        } else {
            throw new Error(result.message || 'Erreur inconnue');
        }
    } catch (error) {
        console.error('Erreur lors du chargement depuis Google Sheets:', error);
        updateSyncStatus('offline');
        throw error;
    }
}

/**
 * Met à jour un invité dans Google Sheets
 */
async function updateGuestInSheet(guest) {
    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'updateGuest',
                guest: guest
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.status === 'success') {
            console.log('✅ Invité mis à jour dans Google Sheets:', guest.name);
            updateLastSyncTime();
            return true;
        } else {
            throw new Error(result.message || 'Erreur lors de la mise à jour');
        }
    } catch (error) {
        console.error('Erreur lors de la mise à jour:', error);
        
        // En cas d'erreur, ajouter aux modifications en attente
        addToPendingChanges('update', guest);
        throw error;
    }
}

/**
 * Ajoute un nouvel invité dans Google Sheets
 */
async function addGuestToSheet(guest) {
    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'addGuest',
                guest: guest
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.status === 'success') {
            console.log('✅ Invité ajouté dans Google Sheets:', guest.name);
            updateLastSyncTime();
            return result.guest;
        } else {
            throw new Error(result.message || 'Erreur lors de l\'ajout');
        }
    } catch (error) {
        console.error('Erreur lors de l\'ajout:', error);
        addToPendingChanges('add', guest);
        throw error;
    }
}

// ==================== GESTION HORS LIGNE ====================

function handleOnlineStatus() {
    isOnline = true;
    console.log('🌐 Connexion rétablie');
    updateSyncStatus('online');
    showNotification('Connexion rétablie - Synchronisation en cours...', 'success');
    
    // Synchroniser les modifications en attente
    syncPendingChanges();
}

function handleOfflineStatus() {
    isOnline = false;
    console.log('📴 Mode hors ligne');
    updateSyncStatus('offline');
    showNotification('Mode hors ligne - Les modifications seront synchronisées plus tard', 'warning');
}

function addToPendingChanges(action, data) {
    pendingChanges.push({
        action: action,
        data: data,
        timestamp: Date.now()
    });
    
    // Sauvegarder les modifications en attente
    localStorage.setItem('pendingChanges', JSON.stringify(pendingChanges));
    updatePendingChangesIndicator();
    
    console.log(`📝 Modification en attente ajoutée: ${action}`, data);
}

async function syncPendingChanges() {
    if (pendingChanges.length === 0) return;
    
    console.log(`🔄 Synchronisation de ${pendingChanges.length} modifications en attente...`);
    updateSyncStatus('syncing');
    
    const successfulSyncs = [];
    
    for (const change of pendingChanges) {
        try {
            switch (change.action) {
                case 'update':
                    await updateGuestInSheet(change.data);
                    break;
                case 'add':
                    await addGuestToSheet(change.data);
                    break;
            }
            successfulSyncs.push(change);
        } catch (error) {
            console.error('Erreur lors de la synchronisation d\'une modification:', error);
            // Garder les modifications qui ont échoué
        }
    }
    
    // Retirer les modifications synchronisées avec succès
    pendingChanges = pendingChanges.filter(change => !successfulSyncs.includes(change));
    localStorage.setItem('pendingChanges', JSON.stringify(pendingChanges));
    updatePendingChangesIndicator();
    
    updateSyncStatus('online');
    
    if (successfulSyncs.length > 0) {
        showNotification(`${successfulSyncs.length} modifications synchronisées`, 'success');
    }
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

function populateTableFilter() {
    const tableFilter = document.getElementById('tableFilter');
    // Vider les options existantes sauf la première
    tableFilter.innerHTML = '<option value="">Toutes les tables</option>';
    
    const tables = [...new Set(guests.map(guest => guest.table))].sort((a, b) => a - b);
    
    tables.forEach(tableNum => {
        const tableName = guests.find(g => g.table === tableNum)?.tableName || `Table ${tableNum}`;
        const option = document.createElement('option');
        option.value = tableNum;
        option.textContent = `Table ${tableNum} - ${tableName}`;
        tableFilter.appendChild(option);
    });
}

function filterGuests() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const tableFilter = document.getElementById('tableFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;
    
    filteredGuests = guests.filter(guest => {
        const matchesSearch = guest.name.toLowerCase().includes(searchTerm) ||
                            (guest.tableName && guest.tableName.toLowerCase().includes(searchTerm)) ||
                            (guest.email && guest.email.toLowerCase().includes(searchTerm));
        
        const matchesTable = !tableFilter || guest.table.toString() === tableFilter;
        
        const matchesStatus = !statusFilter || 
                            (statusFilter === 'present' && guest.present) ||
                            (statusFilter === 'absent' && !guest.present);
        
        return matchesSearch && matchesTable && matchesStatus;
    });
    
    displayGuests();
}

function displayGuests() {
    const guestsGrid = document.getElementById('guestsGrid');
    guestsGrid.innerHTML = '';
    
    if (filteredGuests.length === 0) {
        guestsGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #666;">
                <i class="fas fa-search" style="font-size: 3em; margin-bottom: 20px; opacity: 0.5;"></i>
                <h3>Aucun invité trouvé</h3>
                <p>Essayez de modifier vos critères de recherche</p>
            </div>
        `;
        return;
    }
    
    filteredGuests.forEach(guest => {
        const guestCard = createGuestCard(guest);
        guestsGrid.appendChild(guestCard);
    });
}

function createGuestCard(guest) {
    const card = document.createElement('div');
    card.className = 'guest-card';
    
    // Indicateur de statut de synchronisation
    const syncStatus = isOnline ? '' : '<i class="fas fa-wifi-slash" style="color: orange; margin-left: 10px;" title="Mode hors ligne"></i>';
    
    card.innerHTML = `
        <div class="guest-header">
            <div class="guest-name">${guest.name}${syncStatus}</div>
            <span class="status-badge ${guest.present ? 'present' : 'absent'}">
                ${guest.present ? 'Présent' : 'Absent'}
            </span>
        </div>
        <div class="guest-info">
            <div><i class="fas fa-table"></i> Table ${guest.table} - ${guest.tableName || 'Sans nom'}</div>
            <div><i class="fas fa-phone"></i> ${guest.phone || 'Non renseigné'}</div>
            <div><i class="fas fa-envelope"></i> ${guest.email || 'Non renseigné'}</div>
        </div>
        <button class="toggle-presence ${guest.present ? 'present' : 'absent'}" 
                onclick="togglePresence(${guest.id})"
                ${!isOnline ? 'title="Mode hors ligne - sera synchronisé plus tard"' : ''}>
            ${guest.present ? 'Marquer comme Absent' : 'Marquer comme Présent'}
        </button>
    `;
    
    return card;
}

async function togglePresence(guestId) {
    const guest = guests.find(g => g.id === guestId);
    if (!guest) return;
    
    const oldPresent = guest.present;
    guest.present = !guest.present;
    
    // Mettre à jour l'affichage immédiatement
    displayGuests();
    updateStats();
    saveToLocalStorage();
    
    // Essayer de synchroniser avec Google Sheets
    if (isOnline) {
        try {
            await updateGuestInSheet(guest);
            showNotification(`${guest.name} marqué(e) comme ${guest.present ? 'présent(e)' : 'absent(e)'}`, 'success');
        } catch (error) {
            console.error('Erreur lors de la mise à jour:', error);
            showNotification(`Modification sauvée localement - sera synchronisée plus tard`, 'warning');
        }
    } else {
        addToPendingChanges('update', guest);
        showNotification(`${guest.name} marqué(e) comme ${guest.present ? 'présent(e)' : 'absent(e)'} (hors ligne)`, 'warning');
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

function updatePendingChangesIndicator() {
    const pendingIndicator = document.getElementById('pendingChanges');
    if (pendingChanges.length > 0) {
        pendingIndicator.style.display = 'flex';
        pendingIndicator.classList.add('warning');
        pendingIndicator.innerHTML = `<i class="fas fa-clock"></i><span>${pendingChanges.length} modifications en attente</span>`;
    } else {
        pendingIndicator.style.display = 'none';
    }
}

function updateLastSyncTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('fr-FR');
    document.getElementById('lastSyncTime').textContent = timeString;
    localStorage.setItem('lastSync', now.toISOString());
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    const colors = {
        success: '#2ecc71',
        warning: '#f39c12',
        error: '#e74c3c'
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
        error: 'fas fa-times-circle'
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

function saveToLocalStorage() {
    localStorage.setItem('weddingGuests', JSON.stringify(guests));
    localStorage.setItem('lastSync', Date.now().toString());
}

function loadFromLocalStorage() {
    const savedGuests = localStorage.getItem('weddingGuests');
    const savedPendingChanges = localStorage.getItem('pendingChanges');
    const lastSync = localStorage.getItem('lastSync');
    
    if (savedGuests) {
        guests = JSON.parse(savedGuests);
        filteredGuests = [...guests];
    }
    
    if (savedPendingChanges) {
        pendingChanges = JSON.parse(savedPendingChanges);
        updatePendingChangesIndicator();
    }
    
    if (lastSync) {
        const syncDate = new Date(parseInt(lastSync));
        document.getElementById('lastSyncTime').textContent = syncDate.toLocaleTimeString('fr-FR');
    }
    
    console.log(`📱 ${guests.length} invités chargés depuis le stockage local`);
    if (pendingChanges.length > 0) {
        console.log(`⏳ ${pendingChanges.length} modifications en attente de synchronisation`);
    }
}

// ==================== FONCTIONS AVANCÉES ====================

/**
 * Force une synchronisation complète
 */
async function forceSync() {
    if (!isOnline) {
        showNotification('Impossible de synchroniser hors ligne', 'error');
        return;
    }
    
    try {
        updateSyncStatus('syncing');
        showNotification('Synchronisation en cours...', 'warning');
        
        await loadGuestsFromSheet();
        await syncPendingChanges();
        
        populateTableFilter();
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

// Charger les modifications en attente au démarrage
loadFromLocalStorage();

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