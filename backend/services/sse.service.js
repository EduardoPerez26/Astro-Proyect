const clientByUser = new Map(); 

const HEARTBEAT_MS = 25000;

function registerClient(userId, res){
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control','no-cache, no transform');
    res.setHeader('Connection','keep-alive');
    res.setHeader('X-Accel-Buffering','no');
    res.flushHeaders();
    res.write(': connected\n\n');

    if(!clientByUser.has(userId)) clientByUser.set(userId,new Set());
    clientByUser.get(userId).add(res);

    return function unregister(){
        const set = clientByUser.get(userId);
        if(!set) return;
        set.delete(res);
        if(!set.size) clientByUser.delete(userId);
    };
}

function sendToUser(userId, eventName, payload){
    const set = clientByUser.get(Number(userId));
    if(!set || !set.size) return;

    const frame = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of set)res.write(frame);
}

function sendToUsers(userIds, eventName, payload) {
    for (const userId of userIds) sendToUser(userId, eventName, payload);
}

const heartbeat = setInterval(() => {
    for (const set of clientByUser.values()){
        for (const res of set) res.write(':ping\n\n');
    }
}, HEARTBEAT_MS);
heartbeat.unref();

module.exports = { registerClient , sendToUser , sendToUsers};