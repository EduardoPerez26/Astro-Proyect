const express = require('express');
const router = express.Router();

const { verificarTokenStream } = require ('../middleware/auth.middleware');
const { registerClient } = require ('../services/sse.service');

router.get ('/', verificarTokenStream,(req,res)=>{
    const usuarioId = req.usuario?.id;

    if (!usuarioId){
        return res.status(401).end();
    }

    const unregister = registerClient(usuarioId,res);
    req.on('close',unregister);
});

module.exports = router;