<script>
// Backend API URL
const BACKEND_URL = "https://soconnect-backend.onrender.com";

// App State
let currentUser = null;
let currentUserName = null;
let currentContact = null;
let currentContactName = null;
let contacts = new Map();
let messageCheckInterval = null;
let displayedMessageIds = new Set();
let authToken = null; // Store authentication token

// ... (keep all your existing DOM elements and setup) ...

// Login Function - UPDATED FOR AUTH TOKENS
async function handleLogin() {
    const code = userCodeInput.value.trim();
    const passcode = passcodeInput.value.trim();

    if (!/^\d{5}$/.test(code)) {
        showLoginError('Please enter a valid 5-digit code');
        return;
    }

    try {
        loginBtn.disabled = true;
        loginBtn.textContent = 'Signing In...';
        loginBtn.classList.add('loading');

        const response = await fetch(`${BACKEND_URL}/api/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                code: code,
                passcode: passcode
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Login failed');
        }

        // Store authentication token
        authToken = result.token;
        currentUser = code;
        currentUserName = result.user?.name || getUserName(code);
        
        showChatScreen();
        loadUserContacts();
        startRealTimeUpdates();

    } catch (error) {
        showLoginError(error.message);
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Sign In';
        loginBtn.classList.remove('loading');
    }
}

// Logout Function - UPDATED FOR AUTH TOKENS
async function handleLogout() {
    try {
        // Call logout endpoint to clear server session
        if (authToken) {
            await fetch(`${BACKEND_URL}/api/logout`, {
                method: 'POST',
                headers: {
                    'Authorization': authToken
                }
            });
        }
    } catch (error) {
        console.error('Logout error:', error);
    } finally {
        // Clear local state
        authToken = null;
        currentUser = null;
        currentUserName = null;
        currentContact = null;
        currentContactName = null;
        contacts.clear();
        displayedMessageIds.clear();
        stopRealTimeUpdates();
        
        // Clear inputs
        userCodeInput.value = '';
        passcodeInput.value = '';
        contactCodeInput.value = '';
        messageInput.value = '';
        registerName.value = '';
        registerCode.value = '';
        registerPasscode.value = '';
        confirmPasscode.value = '';
        
        showAuthScreen();
    }
}

// Helper function for authenticated API calls
async function authenticatedFetch(url, options = {}) {
    if (!authToken) {
        throw new Error('Not authenticated');
    }
    
    const headers = {
        'Authorization': authToken,
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    const response = await fetch(url, { ...options, headers });
    
    // If unauthorized, force logout
    if (response.status === 401) {
        handleLogout();
        throw new Error('Session expired');
    }
    
    return response;
}

// UPDATED API CALLS WITH AUTHENTICATION:

// Load messages with authentication
async function loadMessages() {
    if (!currentUser || !currentContact) return;

    try {
        const response = await authenticatedFetch(
            `${BACKEND_URL}/api/messages/${currentUser}/${currentContact}`
        );
        const messages = await response.json();
        
        // Only update if messages have changed
        const currentMessageIds = new Set(messages.map(m => m.id));
        if (currentMessageIds.size !== displayedMessageIds.size || 
            ![...currentMessageIds].every(id => displayedMessageIds.has(id))) {
            
            messagesContainer.innerHTML = '';
            displayedMessageIds.clear();
            
            messages.forEach(message => {
                displayMessage(message);
                displayedMessageIds.add(message.id);
            });
            scrollToBottom();
        }
    } catch (error) {
        console.error('Error loading messages:', error);
        if (error.message === 'Session expired') {
            alert('Your session has expired. Please login again.');
        }
    }
}

// Send message with authentication
async function sendNewMessage() {
    const text = messageInput.value.trim();
    
    if (!text || !currentContact) return;

    try {
        messageInput.disabled = true;
        sendMessageBtn.disabled = true;
        sendMessageBtn.classList.add('loading');

        const response = await authenticatedFetch(`${BACKEND_URL}/api/message`, {
            method: 'POST',
            body: JSON.stringify({
                from: currentUser,
                to: currentContact,
                text: text
            })
        });

        if (!response.ok) {
            throw new Error('Failed to send message');
        }

        messageInput.value = '';
        
        // Add to contacts and reload messages
        if (!contacts.has(currentContact)) {
            contacts.set(currentContact, currentContactName);
            updateContactsList();
        }
        displayedMessageIds.clear();
        loadMessages();

    } catch (error) {
        console.error('Error sending message:', error);
        alert('Failed to send message: ' + error.message);
    } finally {
        messageInput.disabled = false;
        sendMessageBtn.disabled = false;
        sendMessageBtn.classList.remove('loading');
        messageInput.focus();
    }
}

// Load conversations with authentication
async function loadUserContacts() {
    if (!currentUser) return;
    
    try {
        const response = await authenticatedFetch(
            `${BACKEND_URL}/api/conversations/${currentUser}`
        );
        if (response.ok) {
            const conversations = await response.json();
            contacts.clear();
            conversations.forEach(conv => {
                const contactName = getUserName(conv.contact);
                contacts.set(conv.contact, contactName);
            });
        }
        updateContactsList();
    } catch (error) {
        console.error('Error loading conversations:', error);
    }
}

// ... (keep all your other functions the same) ...
</script>
