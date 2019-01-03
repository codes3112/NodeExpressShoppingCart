var express = require('express');
var router = express.Router();
var common = require('./common');

// The homepage of the site
router.get('/', function(req, res, next) {	
    var number_products = req.config.get('application').number_products_index ? req.config.get('application').number_products_index : 8;
    
	req.db.products.find({product_published:'true'}).limit(number_products).exec(function (err, results) {
 		res.render('index', { 
			 title: 'Shop', 
			 results: results, 
			 session: req.session,
			 message: clear_session_value(req.session, "message"),
			 message_type: clear_session_value(req.session, "message_type"),
			 config: req.config.get('application'),
			 helpers: req.handlebars.helpers,
             page_url: req.config.get('application').base_url,
			 show_footer: "show_footer"
		});
	});
});

// The homepage of the site
router.get('/cart', function(req, res, next) {
    res.render('cart', { 
        title: 'Cart', 
        config: req.config.get('application'),
        session: req.session,
        message: clear_session_value(req.session, "message"),
        message_type: clear_session_value(req.session, "message_type"),
        helpers: req.handlebars.helpers,
        show_footer: "show_footer"
    });
});

// The homepage of the site
router.get('/checkout', function(req, res, next) {
    
    // if there is no items in the cart then render a failure
    if(!req.session.cart){
        req.session.message = "The are no items in your cart. Please add some items before checking out";
        req.session.message_type = "danger";
        console.log(req.session.message);
        res.redirect("/cart");
        return;
    }
    
    // render the checkout
    res.render('checkout', { 
        title: 'Checkout', 
        config: req.config.get('application'),
        session: req.session,
        message: clear_session_value(req.session, "message"),
        message_type: clear_session_value(req.session, "message_type"),
        helpers: req.handlebars.helpers,
        show_footer: "show_footer"
    });
});

// The homepage of the site
router.post('/checkout_action', function(req, res, next) {

console.log("hello from checkout-action");
    var config = req.config.get('application');
   
    
    // new order doc
    var order_doc = { 
        order_id: req.session.id,
        order_total: req.session.total_cart_amount,
        order_email: req.body.ship_email,
        order_firstname: req.body.ship_firstname,
        order_lastname: req.body.ship_lastname,
        order_addr1: req.body.ship_addr1,
        order_addr2: req.body.ship_addr2,
        order_country: req.body.ship_country,
        order_state: req.body.ship_state,
        order_postcode: req.body.ship_postcode,
        order_status: "Processing",
        order_date: new Date(),
        order_products: req.session.cart
    };
	
    if(req.session.id){
       
        console.log("data added :Success");
        // no order ID so we create a new one
        req.db.orders.insert(order_doc, function (err, newDoc) {
            newDoc.id = order_doc.order_id;
            // send the order to Paypal
            //common.order_with_paypal(req, res);
        }, res.render('order_summary', { 
            title: "order summary", 
            "result": order_doc,
            config: req.config.get('application'),
            session: req.session,
            helpers: req.handlebars.helpers
        }));         
    }
    //clear the session
    req.session.user=null;
    // clear the cart
    req.session.cart = null;
    req.session.order_id = null;
    req.session.total_cart_amount = 0;
        
});


// show an individual product
router.get('/product/:id',function(req, res) {
	var db = req.db;
	var classy = require("markdown-it-classy");
	var markdownit = req.markdownit;
	markdownit.use(classy);
  
	db.products.findOne({ $or: [{_id: req.params.id}, { product_permalink: req.params.id }] }, function (err, result) {
		// render 404 if page is not published
		if(result == null || result.product_published == "false"){
			res.render('error', { message: '404 - Page not found' });
		}else{	
            // show the view
            common.get_images(result._id, req, res, function (images){
                res.render('product', { 
                    title: result.product_title, 
                    result: result,
                    images: images,
                    product_description: markdownit.render(result.product_description),
                    config: req.config.get('application'),
                    session: req.session,
                    page_url: req.config.get('application').base_url + req.originalUrl,
                    message: clear_session_value(req.session, "message"),
                    message_type: clear_session_value(req.session, "message_type"),
                    helpers: req.handlebars.helpers,
                    show_footer: "show_footer"
                });
            });
        }
    });
});

// logout
router.get('/logout', function(req, res) {
  	req.session.user = null;
	req.session.message = null;
	req.session.message_type = null;
	res.redirect('/');
});

// product list
router.get('/products', restrict, function(req, res) {	
	req.db.products.find({}).sort({product_published_date: -1}).limit(10).exec(function (err, products) {
		res.render('products', { 
		  	title: 'Products',
            config: req.config.get('application'),
			products: products,
			session: req.session,
			message: clear_session_value(req.session, "message"),
			message_type: clear_session_value(req.session, "message_type"),
			helpers: req.handlebars.helpers
		});
	});
});

router.get('/products/:tag', function(req, res) {
	var db = req.db;
	var products_index = req.products_index;

	// we strip the ID's from the lunr index search
	var lunr_id_array = new Array();
	products_index.search(req.params.tag).forEach(function(id) {
		lunr_id_array.push(id.ref);
	});

	// we search on the lunr indexes
	db.products.find({ _id: { $in: lunr_id_array}}).sort({product_published_date: -1}).exec(function (err, results) {
		res.render('products', { 
			title: 'Products', 
            filtered: true,
            config: req.config.get('application'),
			"results": results, 
			session: req.session,
			message: clear_session_value(req.session, "message"),
			message_type: clear_session_value(req.session, "message_type"), 
			search_term: req.params.tag,
			helpers: req.handlebars.helpers
		});
	});
});

// login form
router.get('/login', function(req, res) {
	req.db.users.count({}, function (err, user_count) {  
		// we check for a user. If one exists, redirect to login form otherwise setup
		if(user_count > 0){			
			// set needs_setup to false as a user exists
			req.session.needs_setup = false;
			res.render('login', { 
			  	title: 'Login', 
				referring_url: req.header('Referer'),
				config: req.config.get('application'),
				message: clear_session_value(req.session, "message"), 
				message_type: clear_session_value(req.session, "message_type"),
                helpers: req.handlebars.helpers,
				show_footer: "show_footer"
			});
		}else{
			// if there are no users set the "needs_setup" session
			req.session.needs_setup = true;
			res.redirect('/setup');
		}
	});
});

// setup form is shown when there are no users setup in the DB
router.get('/setup', function(req, res) {	
	req.db.users.count({}, function (err, user_count) {
		// dont allow the user to "re-setup" if a user exists.
		// set needs_setup to false as a user exists
		req.session.needs_setup = false;
		if(user_count == 0){
            req.session.needs_setup = true;
			res.render('setup', { 
			  	title: 'Setup', 
				config: req.config.get('application'),
                helpers: req.handlebars.helpers,
				message: clear_session_value(req.session, "message"), 
				message_type: clear_session_value(req.session, "message_type"),
				show_footer: "show_footer"
			});
		}else{         
			res.redirect('/login');
            return;
		}
	});
});

// login the user and check the password
router.post('/login_action', function(req, res){
    var db = req.db;
	var bcrypt = req.bcrypt;
	
	db.users.findOne({user_email: req.body.email}, function (err, user) {  
		// check if user exists with that email
		if(user === undefined || user === null){
			req.session.message = "A user with that email does not exist.";
			req.session.message_type = "danger";
			res.redirect('/login');
            return;
		}else{
			// we have a user under that email so we compare the password
			if(bcrypt.compareSync(req.body.password, user.user_password) == true){
				req.session.user = req.body.email;
                req.session.users_name = user.users_name;
				req.session.user_id = user._id;
				req.session.is_admin = user.is_admin;
				res.redirect("/admin");
                return;
			}else{
				// password is not correct
				req.session.message = "Access denied. Check password and try again.";
				req.session.message_type = "danger";
				res.redirect('/login');
                return;
			}
		}
	});
});

// search products
router.post('/search', function(req, res) {
	var db = req.db;
	var search_term = req.body.frm_search;
	var products_index = req.products_index;

	// we strip the ID's from the lunr index search
	var lunr_id_array = new Array();
	products_index.search(search_term).forEach(function(id) {
		lunr_id_array.push(id.ref);
	});
	
	// we search on the lunr indexes
	db.products.find({ _id: { $in: lunr_id_array}, product_published:'true'}, function (err, results) {
		res.render('index', { 
			title: 'Results', 
			"results": results, 
            filtered: true,
			session: req.session, 
			search_term: search_term,
			message: clear_session_value(req.session, "message"),
			message_type: clear_session_value(req.session, "message_type"),
			config: req.config.get('application'),
			helpers: req.handlebars.helpers,
			show_footer: "show_footer"
		});
	});
});

// export files into .md files and serve to browser
router.get('/export', restrict, function(req, res) {
	var db = req.db;
	var fs = require('fs');
	var JSZip = require("jszip");
	
	// dump all articles to .md files. Article title is the file name and body is contents
	db.products.find({}, function (err, results) {
		
		// files are written and added to zip.
		var zip = new JSZip();
		for (var i = 0; i < results.length; i++) {
			// add and write file to zip
			zip.file(results[i].product_title + ".md", results[i].product_description);
		}
		
		// save the zip and serve to browser
		var buffer = zip.generate({type:"nodebuffer"});
		fs.writeFile("data/export.zip", buffer, function(err) {
			if (err) throw err;
			res.set('Content-Type', 'application/zip')
			res.set('Content-Disposition', 'attachment; filename=data/export.zip');
			res.set('Content-Length', buffer.length);
			res.end(buffer, 'binary');
			return;
		});
	});
});

//return sitemap
router.get('/sitemap.xml', function(req, res, next) { 
    var sm = require('sitemap');
    
    common.add_products(req, res, function (err, products){
        var sitemap = sm.createSitemap (
        {
            hostname: req.config.get('application').base_url,
            cacheTime: 600000,        // 600 sec - cache purge period 
            urls: [
                { url: '/', changefreq: 'weekly', priority: 1.0 }
            ]
        });

        var current_urls = sitemap.urls;
        var merged_urls = current_urls.concat(products);
        sitemap.urls = merged_urls;
        // render the sitemap
        sitemap.toXML( function (err, xml) {
            if (err) {
                return res.status(500).end();
            }
            res.header('Content-Type', 'application/xml');
            res.send(xml);
        });
    });
});

function clear_session_value(session, session_var){
	var temp = session[session_var];
	session[session_var] = null;
	return temp;
}

// This is called on all URL's. If the "password_protect" config is set to true
// we check for a login on thsoe normally public urls. All other URL's get
// checked for a login as they are considered to be protected. The only exception
// is the "setup", "login" and "login_action" URL's which is not checked at all.
function restrict(req, res, next){
	var url_path = req.url;
    
    if(url_path.substring(0,12) == "/user_insert"){
		next();
		return;
	}

	// if not a public page we 
	check_login(req, res, next);
}

// does the actual login check
function check_login(req, res, next){
	if(req.session.user){
		next();
	}else{
		res.redirect('/login');
	}
}

function safe_trim(str){
	if(str != undefined){
		return str.trim();
	}else{
		return str;
	}
}

module.exports = router;
