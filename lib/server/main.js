(function() {
    'use strict';
    
    /* Global var accessible from any loaded module */
    global.cloudcmd     = {};
    
    var DIR, LIBDIR, SRVDIR, JSONDIR, HTMLDIR,
        Util,
        UTIL = 'util',
        
        SLASH,
        ISWIN32,
        ext,
        path, fs, zlib, url, pipe, CloudFunc, diffPatch, querystring,
        
        OK, FILE_NOT_FOUND, MOVED_PERMANENTLY,
        REQUEST, RESPONSE,
        
        Config = {
            server  : true,
            socket  : true,
            port    : 80
        };
    
    /* Consts */
    
    exports.OK                  = OK                = 200;
                                  MOVED_PERMANENTLY = 301;
    exports.FILE_NOT_FOUND      = FILE_NOT_FOUND    = 404;
    
    exports.REQUEST     = REQUEST           = 'request';
    exports.RESPONSE    = RESPONSE          = 'response';
    
    /* Native Modules*/
    exports.crypto                          = require('crypto'),
    exports.child_process                   = require('child_process'),
    exports.fs          = fs                = require('fs'),
    exports.http                            = require('http'),
    exports.https                           = require('https'),
    exports.path        = path              = require('path'),
    exports.url         = url               = require('url'),
    exports.querystring = querystring       = require('querystring'),
    
    /* Constants */
    /* current dir + 2 levels up */
    exports.WIN32       = ISWIN32           = isWin32();
    exports.SLASH       = SLASH             = '/',
    
    exports.SRVDIR      = SRVDIR            = __dirname + SLASH,
    exports.LIBDIR      = LIBDIR            = path.normalize(SRVDIR + '../'),
    exports.DIR         = DIR               = path.normalize(LIBDIR + '../'),
    exports.HTMLDIR     = HTMLDIR           = DIR + 'html' + SLASH,
    exports.JSONDIR     = JSONDIR           = DIR + 'json' + SLASH,
    
    /* Functions */
    exports.require                         = mrequire,
    exports.librequire                      = librequire,
    exports.srvrequire                      = srvrequire,
    exports.rootrequire                     = rootrequire,
    exports.quietrequire                    = quietrequire,
    
    exports.generateHeaders                 = generateHeaders,
    exports.getQuery                        = getQuery,
    exports.getPathName                     = getPathName,
    exports.isGZIP                          = isGZIP,
    exports.mainSetHeader                   = mainSetHeader,
    
    exports.sendFile                        = sendFile,
    exports.sendResponse                    = sendResponse,
    exports.sendError                       = sendError,
    exports.redirect                        = redirect,
    
    exports.checkParams                     = checkParams,
    exports.checkCallBackParams             = checkCallBackParams,
    
    /* compitability with old versions of node */
    exports.fs.exists                       = exports.fs.exists || exports.path.exists,
    
    /* Needed Modules */
    
    /* we can not use librequare here */
    exports.util        = Util              = require(LIBDIR + UTIL),
    
    exports.zlib        = zlib              = mrequire('zlib'),
    
    /* Main Information */
    exports.modules                         = jsonrequire('modules');
    exports.ext         = ext               = jsonrequire('ext');
    exports.mainpackage                     = rootrequire('package');
    /* base configuration */
    exports.config                          = Config,
    
    
    /* 
     * Any of loaded below modules could work with global var so
     * it should be initialized first. Becouse of almost any of
     * moudles do not depends on each other all needed information
     * for all modules is initialized hear.
     */
    global.cloudcmd.main                    = exports;
    
    exports.VOLUMES                         = getVolumes(),
    
    /* Additional Modules */
    exports.cloudfunc   = CloudFunc         = librequire('cloudfunc'),
    exports.pipe        = pipe              = srvrequire('pipe'),
    exports.socket                          = srvrequire('socket'),
    exports.console                         = srvrequire('console'),
    exports.terminal                        = srvrequire('terminal'),
    exports.express                         = srvrequire('express'),
    exports.auth                            = srvrequire('auth').auth,
    exports.appcache                        = srvrequire('appcache'),
    exports.dir                             = srvrequire('dir'),
    exports.hash                            = srvrequire('hash'),
    diffPatch                               = librequire('diff/diff-match-patch').diff_match_patch,
    exports.diff                            = new (librequire('diff').DiffProto)(diffPatch),
    exports.time                            = srvrequire('time');
    exports.users                           = srvrequire('users');
    exports.rest                            = srvrequire('rest').api,
    exports.update                          = srvrequire('update'),
    exports.ischanged                       = srvrequire('ischanged');
    exports.commander                       = srvrequire('commander');
    exports.files                           = srvrequire('files');
    
    exports.minify                          = srvrequire('minify').Minify;
    
    /* second initializing after all modules load, so global var is   *
     * totally filled of all information that should know all modules */
    global.cloudcmd.main            = exports;
    
    /**
     * function do safe require of needed module
     * @param {Strin} src
     */
    function mrequire(src) {
        var module, msg,
            error = Util.tryCatch(function() {
                module = require(src);
            });
        
        if (error)
            if (error.code === 'MODULE_NOT_FOUND')
                msg = CloudFunc.formatMsg('require', src, 'no');
            else
                Util.log(error);
        
        Util.log(msg);
        
        return module;
    }
    
    function quietrequire(src) {
        var module;
        
        Util.tryCatch(function() {
            module = require(src);
        });
        
        return module;
    }
    
    function rootrequire(src) { return mrequire(DIR + src); }
    
    function librequire(src) { return mrequire(LIBDIR + src); }
    
    function srvrequire(src) { return mrequire(SRVDIR + src); }
    
    function jsonrequire(src) { return mrequire(JSONDIR + src);}
    
    /**
     * function check is current platform is win32
     */
    function isWin32() { return process.platform === 'win32'; }
    
    /**
     * get volumes if win32 or get nothing if nix
     */
    function getVolumes() {
        var lRet = ISWIN32 ? [] : '/';
                
        if (ISWIN32)
            srvrequire('win').getVolumes(function(pVolumes) {
                Util.log(pVolumes);
                exports.VOLUMES = pVolumes;
            });
        
        return lRet;
    }
    
    /**
     * Функция создаёт заголовки файлов
     * в зависимости от расширения файла
     * перед отправкой их клиенту
     * @param pParams
     *  name - имя файла
     * gzip - данные сжаты gzip'ом
     * query
     * https://developers.google.com/speed/docs/best-practices/caching?hl=ru#LeverageProxyCaching
     */
    function generateHeaders(pParams) {
        var lRet    = Util.checkObjTrue(pParams, ['name']);
        
        if (lRet) {
            var p                   = pParams,
                lExt                = Util.getExtension(p.name),
                lType               = ext[lExt] || 'text/plain',
                lContentEncoding    = '';
            
            /* if type of file any, but img - then we shoud specify charset */
            if (!Util.isContainStr(lType, 'img'))
                lContentEncoding = '; charset=UTF-8';
            
            if (Util.isContainStr(p.query, 'download'))
                lType = 'application/octet-stream';
            
            lRet = {
                'Access-Control-Allow-Origin'   : '*',
                'Content-Type'                  : lType + lContentEncoding,
                'last-modified'                 : new Date().toString(),
                'Vary'                          : 'Accept-Encoding'
            };
            
            if (!Util.strCmp(lExt, '.appcache') && p.cache)
                lRet['cache-control']       = 'max-age=' + 31337 * 21;
            
            if (p.gzip)
                lRet['content-encoding']    = 'gzip';
        }
        
        return lRet;
    }
    
    function mainSetHeader(pParams) {
        var p, header, lGzip,
            lRet = checkParams(pParams);
        
        if (lRet) {
            p       = pParams;
            lGzip   = isGZIP(p.request) && p.gzip;
            
            header  = generateHeaders({
                name    : p.name,
                cache   : p.cache,
                gzip    : lGzip,
                query   : getQuery(p.request)
            });
            
            setHeader(header, p.response);
            p.response.statusCode = p.status || OK;
        }
    }
    
    /**
     * send file to client thru pipe
     * and gzip it if client support
     * 
     * @param pName - имя файла
     * @param pGzip - данные сжаты gzip'ом
     */
    function sendFile(pParams) {
        var header, lRet = checkParams(pParams);
        
        if (lRet) {
            var p       = pParams,
                lGzip   = isGZIP(p.request) && p.gzip;
            
            mainSetHeader(pParams);
            
            pipe.create({
                from    : p.name,
                write   : p.response,
                gzip    : lGzip,
                callback: function(error) {
                    if (error)
                        sendError(pParams, error);
                }
            });
        }
        
        return lRet;
    }
     
     
    /**
     * Функция высылает ответ серверу
     * @param pHead     - заголовок
     * @param Data      - данные
     * @param pName     - имя отсылаемого файла
     */
    function sendResponse(params, data, notLog) {
        var p, query, isGzip, head,
            ret = checkParams(params);
        
        if (ret) {
            p           = params;
            data        = p.data || data;
            isGzip      = isGZIP(p.request);
            
            head        = generateHeaders({
                name    : p.name,
                cache   : p.cache,
                gzip    : isGzip,
                query   : query
            });
            
            setHeader(head, p.response);
            
            if (!notLog)
                Util.log(data);
            
            /* если браузер поддерживает gzip-сжатие - сжимаем данные*/
            Util.ifExec(!isGzip,
                function(params) {
                    var ret = Util.checkObj(params, ['data']);
                    
                    if (ret) {
                        p.status    = params.status || p.status;
                        p.data      = params.data;
                    }
                    
                    p.response.statusCode = p.status || OK;
                    p.response.end(p.data);
                },
                
                function(callback) {
                    zlib.gzip (data, function(error, data) {
                        if (!error)
                            p.data = data;
                        else {
                            p.status    = FILE_NOT_FOUND;
                            p.data      = error.toString();
                        }
                        
                        Util.exec(callback, p);
                    });
                });
        }
    }
    
    
    /** 
     * redirect to another URL
     */
    function redirect(pParams) {
        var p, header,
            lRet    = Util.checkObjTrue(pParams, [RESPONSE]);
        
        if (lRet) {
            p       = pParams;
            
            header  = {
                'Location': p.url
            };
            
            setHeader(header, p.response);
            p.response.statusCode = MOVED_PERMANENTLY;
            p.response.end();
        }
    }
    
    
    /**
     * send error response
     */
    function sendError(params, error) {
        var p, ret     = checkParams(params);
        
        if (ret) {
            p           = params;
            p.status    = FILE_NOT_FOUND;
            
            if (!p.data && error)
              p.data    = error.toString();
            
            sendResponse(p);
        }
    }
    
    function checkCallBackParams(pParams) {
        return Util.checkObj(pParams, ['error', 'data', 'params']);
    }
    
    function checkParams(pParams, pAdditional) {
        var lRet = Util.checkObjTrue(pParams, ['name', REQUEST, RESPONSE]);
        
        if (lRet && pAdditional)
            lRet = Util.checkObjTrue( pParams, pAdditional);
        
        return lRet;
    }
    
    function getQuery(req) {
        var query, parsed;
        
        if (req) {
            parsed  = url.parse(req.url);
            query   = parsed.query;
        }
        
        return query;
    }
    
    function getPathName(req) {
        var pathname, parsed;
        
        if (req) {
            parsed      = url.parse(req.url);
            pathname    = parsed.pathname;
            /* supporting of Russian language in directory names */
            pathname    = querystring.unescape(pathname);
        }
        
        return pathname;
    }
    
    function isGZIP(pReq) {
        var lEnc, lGZIP;
        if (pReq) {
            lEnc        = pReq.headers['accept-encoding'] || '';
            lGZIP       = lEnc.match(/\bgzip\b/);
        }
        
        return lGZIP;
    }
    
    function setHeader(header, response) {
        var name;
        
        if (!response.headersSent && Util.isObject(header))
            for (name in header)
                response.setHeader(name, header[name]);
    }
    
})();
