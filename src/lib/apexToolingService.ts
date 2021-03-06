import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';
import * as child_process from 'child_process';


const BIN = 'bin';
const JAR = 'tooling-force.jar';
export class ApexToolingService{
    public tempFolder: string;

    private jarPath: string;
    private userName: string;
	private password: string;
	private instanceUrl: string;

    public constructor(context: vscode.ExtensionContext){
        this.jarPath = context.asAbsolutePath(path.join(BIN, JAR));
        this.tempFolder = context.asAbsolutePath(BIN);

        let config = vscode.workspace.getConfiguration('apexAutoComplete');
		this.userName = config.get('userName') as string;
		this.password = config.get('password') as string;
		this.instanceUrl = config.get('instanceUrl') as string;

    }

    public startService(){
        let cmd = `java -Dfile.encoding=UTF-8  -jar ${this.jarPath} --action=serverStart --port=65000 --timeoutSec=1800`;

    	let child = child_process.exec(cmd);
		child.stderr.on('data', function(data) {
			console.log('stdout: ' + data);
		});
    }


    public listCompletions(document: vscode.TextDocument, position: vscode.Position){
        let tmpFile = this.getTempPath('listCompletionsTmp.cls');
        let resultFile = this.getTempPath('listCompletionsResult.json');

        return new Promise(
            this.writecurrentFileContent(tmpFile, document)
        ).then(
            ()=>{
                return this.sendCommand('listCompletions',
                    resultFile,
                    new Map<String,String>([
                        ['currentFilePath', document.fileName],
                        ['currentFileContentPath', tmpFile],
                        ['line', (position.line+1).toString()],
                        ['column', (position.character+1).toString()]
                    ])
                )
            }
        );
    }

    public findSymbol(document: vscode.TextDocument, position: vscode.Position){
        let tmpFile = this.getTempPath('findSymbolTmp.cls');
        let resultFile = this.getTempPath('findSymbolResult.json');

        return new Promise(
            this.writecurrentFileContent(tmpFile, document)
        ).then(
            () => {
                return this.sendCommand('findSymbol',
                resultFile,
                new Map<String,String>([
                    ['currentFilePath', document.fileName],
                    ['currentFileContentPath', tmpFile],
                    ['line', (position.line+1).toString()],
                    ['column', (position.character+1).toString()]
                ])
                )
            }
        );
    }

    public checkSyntax(document: vscode.TextDocument){
        let tmpFile = this.getTempPath('checkSyntaxTmp.cls');
        let resultFile = this.getTempPath('checkSyntaxResult.json');

        return new Promise(
            this.writecurrentFileContent(tmpFile, document)
        ).then(
            ()=>{
                return this.sendCommand('checkSyntax',
                    resultFile,
                    new Map<String,String>([
                        ['currentFilePath', document.fileName],
                        ['currentFileContentPath', tmpFile]
                    ])
                )
            }
        );
    }

    //sends command to server and returns the resulting data
    private sendCommand(action:string, responseFile:string, opts: Map<String,String>){
			return new Promise((resolve, reject) => {
                let client = new net.Socket();

                //send command
                client.connect(65000, '127.0.0.1',() => {
					let cmd = `--action=${action}  --projectPath='${vscode.workspace.rootPath}' --responseFilePath='${responseFile}' --pollWaitMillis=1000 --maxPollRequests=1000 `;
                    if(opts.size > 0){
                        for (var [key, value] of opts) {
                            cmd += `--${key}='${value}' `;
                        }
                    }

					if(this.userName && this.password && this.instanceUrl){
						cmd += ` --sf.username=${this.userName} --sf.password=${this.password} --sf.serverurl=${this.instanceUrl}`
					}
					cmd +='\n';
					console.log(cmd);
					client.write(cmd);
				});

                //log
                client.on('data',(data) => {
  					let res = data.toString();
                    console.log(res);
				});

                //return on end of data
                client.on('end', function() {
                    client.destroy();
                    resolve();
                });

				client.on('error', (err: any) => {
					if(err.code == 'ECONNREFUSED'){
						//if we get this error, try to kick off server again
						this.startService();
					}
                    reject(err.message);
				});

            }).then( //read result file, return data
                () => {
                    return new Promise((resolve, reject) => {
                        fs.readFile(responseFile, 'utf8', (err, data) => {
                            if (err){
                                reject(err);
                            }
                            resolve(data);
                        })
                    })
                }
            );
    }

    private writecurrentFileContent(fileName :string, document :vscode.TextDocument){
        return (resolve, reject)=>{
            fs.writeFile(fileName, document.getText(), function(err) {
                if (err){
                    reject(err);
                }
                else resolve();
            });
        }
    }

    private getTempPath(fileName: string){
        return path.join(this.tempFolder, fileName);
    }
}