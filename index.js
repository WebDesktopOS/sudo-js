var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
var inpath = require('inpath').sync;
var pidof = require('./libs/pidof');
var sudo = inpath('sudo');
var isWin = (process.platform == 'win32');
var messages = [
    'PID is NULL',
    'password is INVALID'
];

function sudoCommand(command, password, withResult, callback) {
    password = password || '';
    withResult = withResult === undefined ? true : withResult;
    callback = callback || function() {

    };

    var error = null;
    var pids = {};
    var result = '';
    var prompt = '#sudo-js-passwd#';
    var prompts = 0;
    var args = ['-S', '-k', '-p', prompt].concat(command);

    var spawnProcess = spawn(sudo, args, {stdio: 'pipe'});
    
    var bin = command.filter(function(i) {
        return i.indexOf('-') !== 0;
    })[0];

    spawnProcess.stdout.on('data', function(data) {
        result += "\n"+ data.toString();
    });

    function waitForStartup(err, pid) {
        if (err) {
            throw new Error('Couldn\'t start '+ bin);
        }

        if (pid.length || spawnProcess.exitCode !== null) {
            error = null;
            pids = {pid: pid};
            if (!withResult) {
                callback(error, pids, result);
            }
        } else {
            setTimeout(function() {
                pidof(bin, waitForStartup);
            }, 100);
        }

        if (withResult) {
            spawnProcess.on('close', function(code) {
                callback(error, pids, result);
            });
        }
    }
    pidof(bin, waitForStartup);

    spawnProcess.stderr.on("data", function (data) {
        data.toString().trim().split('\n').forEach(function(line) {
            if (line === prompt) {
                if (++prompts > 1) {
                    callback(true, {code: 1, msg: messages[1]}, result);
                    spawnProcess.stdin.write("\n\n\n\n");
                } else {
                    spawnProcess.stdin.write(password + "\n");
                }
            }
        });
    });
}

module.exports = {
    password: '',
    setPassword: function(password) {
        this.password = password;
    },
    check: function(callback) {
        var command = [isWin ? 'dir' : 'ls'];
        if (isWin) {
            // next update
            callback(true);
        } else {
            sudoCommand(command, this.password, false, (function(i) {
              return function (err) {
                if (!i++) {
                  callback(!err)
                }
              }
            })(0));
        }
    },
    exec: function(command, options, callback) {
        var self = this;
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }

        if (typeof options !== 'object') {
            options = {};
        }

        if (typeof callback !== 'function') {
            callback = function() {

            }
        }

        if (!Array.isArray(command)) {
            command = [command];
        }

        if (isWin) {
            exec(command.join(' '), function(err, stdout, stderr) {
                callback(err, {}, stdout.toString());
            });
        } else {
            if (options.check === true || options.check === undefined) {
                this.check(function(valid) {
                    if (valid) {
                        sudoCommand(command, self.password,
                            options.withResult, callback);
                    } else {
                        callback(true, {code: 1, msg: messages[1]}, '');
                    }
                });
            } else {
                sudoCommand(command, self.password, options.withResult, callback);
            }
        }
    },
    killByPid: function(pid, callback) {
        if (pid) {
            pid = pid.toString();
            if (isWin) {
                this.exec(["tskill", pid], callback);
            } else {
                this.exec(["kill", "-9", pid], callback);
            }
        }
    },
    killByName: function(name, callback) {
        var self = this;
        pidof(name, function(err, pids) {
            if (pids && pids.length) {
                pids.forEach(function(pid) {
                    self.killByPid(pid, callback);
                });
            } else {
                callback(true, {code: 0, msg: messages[0]}, '');
            }
        });
    }
}