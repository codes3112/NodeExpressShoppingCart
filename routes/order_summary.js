var express = require('express');
var router = express.Router();
var common = require('./common');

// router.get('/', function(req, res, next) {	
//     res.render("order_summary");
// });
router.get('/order_summary/view/:id', common.restrict, function(req, res) {

	req.db.orders.findOne({_id: newDoc._id}, function (err, result) {
		res.render('order_summary', { 
			title: 'Order Summary', 
			result: result,    
            config: req.config.get('application'), 
            message: common.clear_session_value(req.session, "message"),
			message_type: common.clear_session_value(req.session, "message_type"),
			editor: true,     
			session: req.session,
			helpers: req.handlebars.helpers
		});
	});
});

module.exports = router;
