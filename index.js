"use strict";
/*
 * Google drive storage for ghost blog
 * @author : Robin C Samuel <hi@robinz.in> http://robinz.in
 * @date : 11th August 2015
 * @updated: 25th Aug 2020 - @behoyh
 */

const StorageBase = require("ghost-storage-base");
const fs = require("fs");
const { google } = require("googleapis");

const API_VERSION = "v3";
const API_SCOPES = ["https://www.googleapis.com/auth/drive"];

class ghostGoogleDrive extends StorageBase {
  constructor(config) {
    super();
    this.config = config;
  }

  /**
   * Saves the image to storage (the file system)
   * - image is the express image object
   * - returns a promise which ultimately returns the full url to the uploaded image
   *
   * @param image
   * @param targetDir
   * @returns {*}
   */
  save(file, targetDir) {
    const _this = this;
    return new Promise(async function(resolve, reject) {
      const key = _this.config.key;
      const jwtClient = new google.auth.JWT(
        key.client_email,
        null,
        key.private_key,
        API_SCOPES,
        null
      );

      try {
        await jwtClient.authorize();

        const drive = google.drive({
          version: API_VERSION,
          auth: jwtClient
        });

        const fileUploadRes = await drive.files.create({
          resource: {
            name: file.name,
          },
          media: {
            mimeType: file.type,
            body: fs.createReadStream(file.path)
          }
        });

        const { data } = fileUploadRes;
        await drive.permissions.create({
          fileId: data.id,
          supportsAllDrives: true,
          supportsTeamDrives: true,
          resource: {
              'type': 'anyone',
              'role': 'reader',
          }
        });
              
        // make the url looks like a file
        resolve("/content/images/" + data.id + file.ext);
      } catch (err) {
        console.error(err);
        reject(err);
      }
    });
  }

  exists(fileName, targetDir) {
    return true;
  }

  /**
   * For some reason send divides the max age number by 1000
   * Fallthrough: false ensures that if an image isn't found, it automatically 404s
   * Wrap server static errors
   *
   * @returns {serveStaticContent}
   */
  serve() {
    const _this = this;
    return async function(req, res, next) {
      // get the file id from url
      const id = req.path.replace("/", "").split(".")[0];

      const key = _this.config.key;
      const jwtClient = new google.auth.JWT(
        key.client_email,
        null,
        key.private_key,
        API_SCOPES,
        null
      );

      try {
        await jwtClient.authorize()

        const drive = google.drive({
          version: API_VERSION,
          auth: jwtClient
        });

        const fileGetRes = await drive.files.get({
          fileId: id,
          alt: 'media'
        }, {
          responseType: 'stream'
        });

        res.set("Cache-Control", "public, max-age=1209600");
        fileGetRes.data
          .on('end', () => {
            console.log('Done downloading file.');
          })
          .on('error', err => {
            console.error(err);
            next(err);
          })
          .pipe(res);
      } catch (err) {
        console.error(err);
        next(err);
      }
    };
  }

  /**
   * Not implemented.
   * @returns {Promise.<*>}
   */
  delete(options) {
    const _this = this;
    const id = options.path.replace("/", "").split(".")[0];
    return new Promise(async function(resolve, reject) {
      const key = _this.config.key;
      const jwtClient = new google.auth.JWT(
        key.client_email,
        null,
        key.private_key,
        API_SCOPES,
        null
      );

      try {
        await jwtClient.authorize();

        const drive = google.drive({
          version: API_VERSION,
          auth: jwtClient
        });

        await drive.files.delete({
          fileId: id
        });

        resolve();
      } catch (err) {
        console.error(err);
        reject(err);
      }
    });
  }

  /**
   * Reads bytes from disk for a target image
   * - path of target image (without content path!)
   *
   * @param options
   */
  read(options) {
    const _this = this;
    const id = options.path.replace("/", "").split(".")[0];
    return new Promise(async function(resolve, reject) {
      const key = _this.config.key;
      const jwtClient = new google.auth.JWT(
        key.client_email,
        null,
        key.private_key,
        API_SCOPES,
        null
      );

      try {
        await jwtClient.authorize();

        const drive = google.drive({
          version: API_VERSION,
          auth: jwtClient
        });

        const fileGetRes = await drive.files.get({
          fileId: id,
          alt: 'media'
        }, {
          responseType: 'stream'
        });

        let bytes = [];
        fileGetRes.data
          .on("data", chunk => {
              bytes.push(chunk);
            })
          .on("error", err => {
            console.error(err);
            reject(err);
          })
          .on("end", () => {
            const binary = Buffer.concat(bytes);
            resolve(binary);
          });
      } catch(err) {
        console.error(err);
        reject(err);
      }
    });
  }
}

module.exports = ghostGoogleDrive;
