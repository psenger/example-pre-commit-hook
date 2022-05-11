#!/usr/bin/env node

/**
 * Pre commit hook to compare the hash code of two files.
 */

const os = require('os');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const childProcess = require('child_process');
const crypto = require('crypto');

(async ()=>{

    const allEqual = (arr, accessor) => arr.every(val => val[accessor] === arr[0][accessor]);
    const zip = (arr, ...args) => arr.map((value, idx) => [value, ...args.map(arr => arr[idx])])
    const checksumFile = async function checksumFile(hashName, path) {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash(hashName);
            const stream = fs.createReadStream(path);
            stream.on('error', err => reject(err));
            stream.on('data', chunk => hash.update(chunk));
            stream.on('end', () => resolve(hash.digest('hex')));
        });
    }

    const [ , , ...args] = process.argv;

    if ( args.length != 2 ) {
        console.log(`Usage: ${path.basename(__filename)} <file> <file>`);
        process.exit(1);
    }

    let resultsOfTest = await Promise.all(
        zip( args,
            await Promise.all( args.map( fs.existsSync ) )
        ).map( async ([file, exists]) => {
            let isFile = false
            if (exists) {
                let stat = await fsp.stat(path.join(file))
                isFile = stat.isFile()
            }
            return [file, exists, isFile, path.resolve(path.join(file))]
        })
    )

    if ( resultsOfTest.some(([,exist,isFile])=>!exist||!isFile) ) {
        const missingFiles = resultsOfTest.filter(([,exist])=>!exist).map(([name,])=>name);
        const notFiles = resultsOfTest.filter(([,,isFile])=>!isFile).map(([name,])=>name);
        const troubledFiles = Array.from(new Set(
                missingFiles.concat(notFiles)
            )
        );
        const file = `File${troubledFiles.length===1?'':'s'}`
        const does = `${troubledFiles.length==1?'does':'do'}`
        console.log(`${file} ${troubledFiles.join(' and ')} ${does} not exist or is not a file`);
        process.exit(1);
    }

    const resultsOfMd5Sum = await Promise.all(
        resultsOfTest.map(async ([file, exists, isFile, fullPathFileName])=>{
            const md5Sum = await checksumFile('md5', fullPathFileName)
            return [ file, exists, isFile, fullPathFileName, md5Sum ]
        })
    )

    const fileNames = resultsOfMd5Sum.map(([name])=>name).join(' and ');
    if ( allEqual(resultsOfMd5Sum,4) ) {
        console.log(`Files ${fileNames} are equal`);
        process.exit(0);
    }
    console.log(`Files ${fileNames} are not equal`);
    process.exit(1);
})()
