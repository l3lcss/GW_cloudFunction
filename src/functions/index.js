import * as functions from "firebase-functions"
const admin = require('firebase-admin')
import { dateTime } from 'luxon'
admin.initializeApp({
    credential: admin.credential.applicationDefault() 
})
const state = {
  GEN_CODE: 'GEN_CODE',
  FIND_CODE: 'FIND_CODE',
  USE_CODE: 'USE_CODE'
}
const db = admin.firestore()

export let getDiscount = functions.https.onRequest(async (req, res) => {
  let promoCode = req.query.promoCode
  let c = await db.collection('promoCode').doc(promoCode).get()
  if (c.exists) {
      let data = c.data()
      res.send({
        ...data,
        promoCode: promoCode})
  } else {
      res.send(null)
  }
})

export let checkOut = functions.https.onRequest(async (req, res) => {
  let {tel, net, promoCode} = req.query
  if (promoCode) {
    const c = await db.collection('promoCode').doc(promoCode).get()
    if (c.exists && c.data().status === 'unused') {
      if (c.data().type === 'onetime') {
        await db.collection('promoCode').doc(promoCode).update({
          status: 'used'
        })
        // TODO : DB Transaction + logging
      }
      if (c.data().discount_type === 'Baht') {
        net = net - (c.data().discount_number)
      } else if (c.data().discount_type === '%') {
        net = net - ((net * c.data().discount_number) / 100)
      }
    }
  }

  const result = await db.collection('vip').doc(tel).get()
  if (result.exists && net >= 3000) {
    let generatedCode = genCode()
    let date = dateTime.utc()
    let expDate = dateTime.utc().plus({ months: 2 })
    // let date = new Date()
    // let expDate = new Date()
    let newCode = {
      create_date: date,
      discount_number: 300,
      discount_type: 'Baht',
      exp_date: expDate,
      status: 'unused',
      type: 'onetime'
    }
    await db.collection('promoCode').doc(generatedCode).set(newCode)
    res.send({ Code : generatedCode, Net : net})
  } else {
    res.send({Net: net})
  }
})

function genCode() {
  var code = ''
  var message = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
  for (var i = 0; i < 5; i++) {
    code += message.charAt(Math.floor(Math.random() * message.length))
  }
  // TODO : DB Transaction + check DB
  return code
}

function setLog (raw, state, code) {
  db.collection('logs').add({
      time: new Date(),
      state: state,
      code: code,
      raw: raw
  })
}

// const message = () => {
//   return new Promise(resolve => {
//     setTimeout(() => {
//       resolve(`from Babelified Cloud Functions!`)
//     }, 1000)
//   })
// }

// export let helloWorld = functions.https.onRequest(async (req, res) => {
//   let world = await message()
//   res.status(200).send(`Hello ${world}`)
// })
