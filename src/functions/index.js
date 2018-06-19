import * as functions from 'firebase-functions'
import admin from 'firebase-admin'
const cors = require('cors')({origin: true})

admin.initializeApp({
    credential: admin.credential.applicationDefault() 
})
const state = {
  GEN_CODE: 'GEN_CODE',
  FIND_CODE: 'FIND_CODE',
  USE_CODE: 'USE_CODE',
  VALIDATE_DATA: 'VALIDATE_DATA'
}

const db = admin.firestore()

export const getDiscount = functions.https.onRequest(async (req, res) => {
  const promoCode = req.query.promoCode
  let raw = {
    promoCode
  }
  const promotionDetails = await db.collection('promoCode').doc(promoCode).get()
  if (promotionDetails.exists) {
    let promotionData = promotionDetails.data()
    setLog(raw, state.FIND_CODE, promotionData)
    res.send({
      ...promotionData,
      promoCode
    })
  } else {
    setLog(raw, state.FIND_CODE, null)
    res.status(200).send({
      message: 'promotionCode not found'
    })
  }
})

export const checkOut = functions.https.onRequest(async (req, res) => {
  let {tel, net, promoCode} = req.query
  let raw = {
    tel,
    net,
    promoCode
  }
  if (!validateDataInput(tel, net)) {
    res.status(400).send({
      message: 'tel and net should be numeric',
      data: {
        status: 400
      }
    })
  }
  if (promoCode) {
    const promotion = await db.runTransaction(transaction => {
      return transaction.get(db.collection('promoCode').doc(promoCode))
      .then (async selectedPromotion => {
        if (selectedPromotion.exists && selectedPromotion.data().status === 'unused' && (selectedPromotion.data().exp_date > new Date())) {
          setStatusPromoCode(selectedPromotion.data().type, promoCode)
          net = await getNetDiscount ( 
            net,
            selectedPromotion.data().discount_type,
            selectedPromotion.data().discount_number
          )
          setLog(raw, state.USE_CODE, net)
        } else {
          setLog(raw, state.USE_CODE, net)
        }
      })
    }).then(() => {
      console.log('Transaction used code success')
    }).catch(err => {
      console.error(err)
    })
  }
  const result = await getNewPromoCode(tel, net)
  res.send(result)
})

function getNetDiscount (net, discountType, discountNumber) { 
  const discountNumberInt = parseInt(discountNumber)
  if (discountType === 'amount') {
    net = net - discountNumberInt
  } else if (discountType === 'percent') {
    net = net - ((net * discountNumberInt) / 100)
  }
  if (net < 0) {
    net = 0
  }
  return net.toString()
}

function validateDataInput (tel, net) {
  if (!((tel) && (net)) || !(/^\d+$/.test(net))) {
    return false
  } else {
    return true
  }
}

function setStatusPromoCode (type, promoCode) {
  if (type === 'onetime') {
    db.collection('promoCode').doc(promoCode).update({
      status: 'used'
    })
  }
}

async function getNewPromoCode (tel, net) {
  let raw = {
    tel,
    net
  }
  const vip = await db.collection('vip').doc(tel).get()
  if (vip.exists && net >= 3000) {
    let generatedCode = genCode()
    const promotionDocument = await db.runTransaction(transaction => {
      return transaction.get(db.collection('promoCode').doc(generatedCode))
        .then (async totalPromotionCode => {
          if (!totalPromotionCode.exists) {
            setNewDocumentPromoCode (generatedCode)
            setLog(raw, state.GEN_CODE, { newGenerateCode : generatedCode, netDiscount : net})
          }
      })
    })
    return ({ newGenerateCode : generatedCode, netDiscount : net})
  } else {
    setLog(raw, state.GEN_CODE, { newGenerateCode : null, netDiscount : net})
    return ({netDiscount: net})
  }
}

async function setNewDocumentPromoCode (generatedCode) {
  let createDate = new Date()
  let expDate = new Date(createDate.getFullYear(), createDate.getMonth()+3, createDate.getDate(), createDate.getHours(), createDate.getMinutes(), createDate.getSeconds())
  const newCode = {
    create_date: createDate,
    discount_number: '300',
    discount_type: 'amount',
    exp_date: expDate,
    status: 'unused',
    type: 'onetime'
  }
  await db.collection('promoCode').doc(generatedCode).set(newCode)
}

function genCode() { // check Code
  let code
  const message = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789'
  do {
    code = randomPromoCode (message)//AA
  } while (checkCode(code))
  return code
} 

function randomPromoCode (message) {
  let code = ''
    for (let i = 0; i < 5; i++) {
      code += message.charAt(Math.floor(Math.random() * message.length))
    }
  return code
}

function checkCode (code) {
  const hasPromocode = db.collection('promoCode').doc(code).get()
  return hasPromocode.exists
}

function setLog (raw, state, result) {
  db.collection('logs').add({
    time: new Date(),
    state: state,
    result: result,
    raw: raw
  })
}
