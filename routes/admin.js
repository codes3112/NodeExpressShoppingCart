var express = require('express');
var common = require('./common');
var router = express.Router();

// Admin section
router.get('/', common.restrict, function(req, res, next) {
	res.redirect("/admin/orders");
});

// Admin section
router.get('/orders', common.restrict, function(req, res, next) {	
	// Top 10 products
	req.db.orders.find({}).limit(10).sort({"order_date": -1}).exec(function (err, orders) {
 		res.render('orders', { 
			 title: 'Cart', 
			 orders: orders, 
             config: req.config.get('application'),
			 session: req.session,
			 message: common.clear_session_value(req.session, "message"),
			 message_type: common.clear_session_value(req.session, "message_type"),
			 helpers: req.handlebars.helpers,
			 show_footer: "show_footer"
		});
	});
});

// render the editor
router.get('/order/view/:id', common.restrict, function(req, res) {

	req.db.orders.findOne({_id: req.params.id}, function (err, result) {
		res.render('order', { 
			title: 'View order', 
			"result": result,    
            config: req.config.get('application'),      
			session: req.session,
			message: common.clear_session_value(req.session, "message"),
			message_type: common.clear_session_value(req.session, "message_type"),
			editor: true,
			helpers: req.handlebars.helpers
		});
	});
});

// Admin section
router.get('/orders/filter/:search', common.restrict, function(req, res, next) {
	var search_term = req.params.search;
	var orders_index = req.orders_index;

	// we strip the ID's from the lunr index search
	var lunr_id_array = new Array();
	orders_index.search(search_term).forEach(function(id) {
		lunr_id_array.push(id.ref);
	});
	
	// we search on the lunr indexes
	req.db.orders.find({ _id: { $in: lunr_id_array}}, function (err, orders) {
		res.render('orders', { 
			title: 'Order results', 
            orders: orders, 
            config: req.config.get('application'),
			session: req.session, 
			search_term: search_term,
			message: common.clear_session_value(req.session, "message"),
			message_type: common.clear_session_value(req.session, "message_type"),
			helpers: req.handlebars.helpers,
			show_footer: "show_footer"
		});
	});
});

// order product
router.get('/order/delete/:id', common.restrict, function(req, res) {
  	var db = req.db;
	var orders_index = req.orders_index;
	
	// remove the article
	db.orders.remove({_id: req.params.id}, {}, function (err, numRemoved) {
		
		// remove the index
		orders_index.remove({id: req.params.id}, false);
        
		// redirect home
		req.session.message = "Order successfully deleted";
		req.session.message_type = "success";
		res.redirect('/admin/orders');
  	});
});

// update order status
router.post('/order/statusupdate', common.restrict, function(req, res) {
	var orders_index = req.orders_index;

    req.db.orders.update({_id: req.body.order_id},{$set: {order_status: req.body.status} }, { multi: false }, function (err, numReplaced) {
        res.status(200).json({message: 'Status successfully updated'});
  	});
});

// Admin section
router.get('/products', common.restrict, function(req, res, next) {	
	// get the top results
	req.db.products.find({}).limit(10).sort({"product_added_date": -1}).exec(function (err, top_results) {
 		res.render('products', { 
			 title: 'Cart', 
			 "top_results": top_results, 
			 session: req.session,
             config: req.config.get('application'),
			 message: common.clear_session_value(req.session, "message"),
			 message_type: common.clear_session_value(req.session, "message_type"),
			 helpers: req.handlebars.helpers,
			 show_footer: "show_footer"
		});
	});
});

// Admin section
router.post('/product/addtocart', function(req, res, next) {	
    var _ = require('underscore');
    var product_quantity = req.body.product_quantity ? parseInt(req.body.product_quantity): 1;
    
    // setup cart object if it doesn't exist
    if(!req.session.cart){
        req.session.cart = {};
    }
    
	req.db.products.findOne({_id: req.body.product_id}).exec(function (err, product) {
        if(product){
            var product_price = parseFloat(product.product_price).toFixed(2);
            // if exists we add to the existing value
            if(req.session.cart[req.body.product_id]){
                req.session.cart[req.body.product_id]["quantity"] = req.session.cart[req.body.product_id]["quantity"] + product_quantity;
                req.session.cart[req.body.product_id]["total_item_price"] = product_price * req.session.cart[req.body.product_id]["quantity"];
            }else{
                // Doesnt exist so we add to the cart session
                req.session.cart_total_items = req.session.cart_total_items + product_quantity;
                
                // new product deets
                var product_obj = {};
                product_obj.title = product.product_title;
                product_obj.quantity = product_quantity;
                product_obj.total_item_price = product_price * product_quantity;
                if(product.product_permalink){
                    product_obj.link = product.product_permalink;
                }else{
                    product_obj.link = product._id;
                }
                
                // new product id
                var cart_obj = {};
                cart_obj[product._id] = product_obj;
                
                // merge into the current cart
                _.extend(req.session.cart, cart_obj);
            }
            
            // update total cart amount
            common.update_total_cart_amount(req, res);
            
            // update how many products in the shopping cart
            req.session.cart_total_items = Object.keys(req.session.cart).length;
            res.status(200).json({message: 'Cart successfully updated', "total_cart_items": Object.keys(req.session.cart).length});
        }else{
            res.status(400).json({message: 'Error updating cart. Please try again.'});
        }
	});
});

// Updates a single product quantity
router.post('/product/updatecart', function(req, res, next) {	
    var product_quantity = req.body.product_quantity ? req.body.product_quantity: 1;
    
    if(product_quantity == 0){
        // quantity equals zero so we remove the item
        delete req.session.cart[req.body.product_id]; 
        
        // update total cart amount
        common.update_total_cart_amount(req, res);       
        res.status(200).json({message: 'Cart successfully updated', "total_cart_items": Object.keys(req.session.cart).length});
    }else{
        req.db.products.findOne({_id: req.body.product_id}).exec(function (err, product) {
            if(product){
                var product_price = parseFloat(product.product_price).toFixed(2);
                if(req.session.cart[req.body.product_id]){
                    req.session.cart[req.body.product_id]["quantity"] = product_quantity;
                    req.session.cart[req.body.product_id]["total_item_price"] = product_price * product_quantity;
                    
                    // update total cart amount
                    common.update_total_cart_amount(req, res);
                    res.status(200).json({message: 'Cart successfully updated', "total_cart_items": Object.keys(req.session.cart).length});
                }else{
                    res.status(400).json({message: 'Error updating cart. Please try again', "total_cart_items": Object.keys(req.session.cart).length});
                }
            }else{
                res.status(400).json({message: 'Cart item not found', "total_cart_items": Object.keys(req.session.cart).length});
            }
        });
    }
});

// Remove single product from cart
router.post('/product/removefromcart', function(req, res, next) {	
    delete req.session.cart[req.body.product_id]; 
    
    // update total cart amount
    common.update_total_cart_amount(req, res);
    res.status(200).json({message: 'Product successfully removed', "total_cart_items": 0});
});

// Totally empty the cart
router.post('/product/emptycart', function(req, res, next) {	
    delete req.session.cart;
    delete req.session.order_id;
    
    // update total cart amount
    common.update_total_cart_amount(req, res);
    res.status(200).json({message: 'Cart successfully emptied', "total_cart_items": 0});
});

// Admin section
router.get('/products/filter/:search', common.restrict, function(req, res, next) {
	var search_term = req.params.search;
	var products_index = req.products_index;

	// we strip the ID's from the lunr index search
	var lunr_id_array = new Array();
	products_index.search(search_term).forEach(function(id) {
		lunr_id_array.push(id.ref);
	});
	
	// we search on the lunr indexes
	req.db.products.find({ _id: { $in: lunr_id_array}}, function (err, results) {
		res.render('products', { 
			title: 'Results', 
			"results": results, 
            config: req.config.get('application'),
			session: req.session, 
			search_term: search_term,
			message: common.clear_session_value(req.session, "message"),
			message_type: common.clear_session_value(req.session, "message_type"),
			helpers: req.handlebars.helpers,
			show_footer: "show_footer"
		});
	});
});

// insert form
router.get('/product/new', common.restrict, function(req, res) {
	res.render('product_new', {
		title: 'New product', 
		session: req.session,
		product_title: common.clear_session_value(req.session, "product_title"),
		product_description: common.clear_session_value(req.session, "product_description"),
	    product_price: common.clear_session_value(req.session, "product_price"),
		product_permalink: common.clear_session_value(req.session, "product_permalink"),
		message: common.clear_session_value(req.session, "message"),
		message_type: common.clear_session_value(req.session, "message_type"),
		editor: true,
		helpers: req.handlebars.helpers,
		config: req.config.get('application')
	});
});

// insert new product form action
router.post('/product/insert', common.restrict, function(req, res) {
  	var db = req.db;
	var products_index = req.products_index;

    var doc = { 
		product_permalink: req.body.frm_product_permalink,
        product_title: req.body.frm_product_title,
        product_price: req.body.frm_product_price,
		product_description: req.body.frm_product_description,
		product_published: req.body.frm_product_published,
        product_featured: req.body.frm_product_featured,
        product_added_date: new Date(),
	};

	db.products.count({'product_permalink': req.body.frm_product_permalink}, function (err, product) {
		if(product > 0 && req.body.frm_product_permalink != ""){
			// permalink exits
			req.session.message = "Permalink already exists. Pick a new one.";
			req.session.message_type = "danger";
			
			// keep the current stuff
			req.session.product_title = req.body.frm_product_title;
			req.session.product_description = req.body.frm_product_description;
			req.session.product_price = req.body.frm_product_price;
			req.session.product_permalink = req.body.frm_product_permalink;
				
			// redirect to insert
			res.redirect('/admin/insert');
		}else{
			db.products.insert(doc, function (err, newDoc) {
				if(err){
					console.error("Error inserting document: " + err);
					
					// keep the current stuff
					req.session.product_title = req.body.frm_product_title;
					req.session.product_description = req.body.frm_product_description;
					req.session.product_price = req.body.frm_product_price;
					req.session.product_permalink = req.body.frm_product_permalink;
					
					req.session.message = "Error: " + err;
					req.session.message_type = "danger";
					
					// redirect to insert
					res.redirect('/admin/insert');
				}else{
					// create lunr doc
					var lunr_doc = { 
						product_title: req.body.frm_product_title,
						product_description: req.body.frm_product_description,
						id: newDoc._id
					};
					
					// add to lunr index
					products_index.add(lunr_doc);
					
					req.session.message = "New product successfully created";
					req.session.message_type = "success";
					
					// redirect to new doc
					res.redirect('/admin/product/edit/' + newDoc._id);
				}
			});
		}
	});
});

// render the editor
router.get('/product/edit/:id', common.restrict, function(req, res) {
	var db = req.db;
    var classy = require("markdown-it-classy");
	var markdownit = req.markdownit;
	markdownit.use(classy);

    common.get_images(req.params.id, req, res, function (images){
        db.products.findOne({_id: req.params.id}, function (err, result) {
            res.render('product_edit', { 
                title: 'Edit product', 
                "result": result,
                images: images,          
                session: req.session,
                message: common.clear_session_value(req.session, "message"),
                message_type: common.clear_session_value(req.session, "message_type"),
                config: req.config.get('application'),
                editor: true,
                helpers: req.handlebars.helpers
            });
        });
    });
});

// Update an existing product form action
router.post('/product/update', common.restrict, function(req, res) {
  	var db = req.db;
	var products_index = req.products_index;
 
 	db.products.count({'product_permalink': req.body.frm_product_permalink, $not: { _id: req.body.frm_product_id }}, function (err, product) {
		if(product > 0 && req.body.frm_product_permalink != ""){
			// permalink exits
			req.session.message = "Permalink already exists. Pick a new one.";
			req.session.message_type = "danger";
			
			// keep the current stuff
			req.session.product_title = req.body.frm_product_title;
			req.session.product_description = req.body.frm_product_description;
			req.session.product_price = req.body.frm_product_price;
			req.session.product_permalink = req.body.frm_product_permalink;
            req.session.product_featured = req.body.frm_product_featured;
				
			// redirect to insert
			res.redirect('/edit/' + req.body.frm_product_id);
		}else{
			//db.products.findOne({_id: req.body.frm_product_id}, function (err, article) {
            common.get_images(req.body.frm_product_id, req, res, function (images){
                var product_doc = {
                    product_title: req.body.frm_product_title,
                    product_description: req.body.frm_product_description,
                    product_published: req.body.frm_product_published,
                    product_price: req.body.frm_product_price,
                    product_permalink: req.body.frm_product_permalink,
                    product_featured: req.body.frm_product_featured
                }
                
                // if no featured image
                if(!product_doc.product_image){
                    if(images.length > 0){
                        product_doc["product_image"] = images[0].path;
                    }else{
                        product_doc["product_image"] = "/uploads/placeholder.png";
                    }
                }
                
                db.products.update({_id: req.body.frm_product_id},{ $set: product_doc}, {},  function (err, numReplaced) {
                    if(err){
                        console.error("Failed to save product: " + err)
                        req.session.message = "Failed to save. Please try again";
                        req.session.message_type = "danger";
                        res.redirect('/edit/' + req.body.frm_product_id);
                    }else{
                        // create lunr doc
                        var lunr_doc = { 
                            product_title: req.body.frm_product_title,
                            product_description: req.body.frm_product_description,
                            id: req.body.frm_product_id
                        };
                        
                        // update the index
                        products_index.update(lunr_doc, false);
                        
                        req.session.message = "Successfully saved";
                        req.session.message_type = "success";
                        res.redirect('/admin/product/edit/' + req.body.frm_product_id);
                    }
                });
			});
		}
	});
});

// delete product
router.get('/product/delete/:id', common.restrict, function(req, res) {
    var rimraf = require('rimraf');
	var products_index = req.products_index;
	
	// remove the article
	req.db.products.remove({_id: req.params.id}, {}, function (err, numRemoved) {      
        // delete any images and folder
        rimraf("public/uploads/" + req.params.id, function(err) {
            
            // create lunr doc
            var lunr_doc = { 
                product_title: req.body.frm_product_title,
                product_description: req.body.frm_product_description,
                id: req.body.frm_product_id
            };
            
            // remove the index
            products_index.remove(lunr_doc, false);
            
            // redirect home
            req.session.message = "Product successfully deleted";
            req.session.message_type = "success";
            res.redirect('/admin/products');
        });
  	});
});

// users
router.get('/users', common.restrict, function(req, res) {
	req.db.users.find({}, function (err, users) {
		res.render('users', { 
		  	title: 'Users',
			users: users,
			config: req.config.get('application'),
			is_admin: req.session.is_admin,
			helpers: req.handlebars.helpers,
			session: req.session,
			message: common.clear_session_value(req.session, "message"),
			message_type: common.clear_session_value(req.session, "message_type"),
		});
	});
});

// edit user
router.get('/user/edit/:id', common.restrict, function(req, res) {
	req.db.users.findOne({_id: req.params.id}, function (err, user) {
      
        // if the user we want to edit is not the current logged in user and the current user is not
        // an admin we render an access denied message
        if(user.user_email != req.session.user && req.session.is_admin == "false"){
            req.session.message = "Access denied";
            req.session.message_type = "danger";
            res.redirect('/Users/');
            return;
        }
        
		res.render('user_edit', { 
		  	title: 'User edit',
			user: user,
			session: req.session,
			message: common.clear_session_value(req.session, "message"),
			message_type: common.clear_session_value(req.session, "message_type"),
            helpers: req.handlebars.helpers,
			config: req.config.get('application')
		});
	});
});

// update a user
router.post('/user/update', common.restrict, function(req, res) {
  	var db = req.db;
	var bcrypt = req.bcrypt;
    
    var is_admin = req.body.user_admin == 'on' ? "true" : "false";
    
    // get the user we want to update
    req.db.users.findOne({_id: req.body.user_id}, function (err, user) {
        // if the user we want to edit is not the current logged in user and the current user is not
        // an admin we render an access denied message
        if(user.user_email != req.session.user && req.session.is_admin == "false"){
            req.session.message = "Access denied";
            req.session.message_type = "danger";
            res.redirect('/admin/users/');
            return;
        }
        
        // create the update doc
        var update_doc = {};
        update_doc.is_admin = is_admin;
        update_doc.users_name = req.body.users_name;
        if(req.body.user_password){
            update_doc.user_password = bcrypt.hashSync(req.body.user_password);
        }
        
        db.users.update({ _id: req.body.user_id }, 
            { 
                $set:  update_doc 
            }, { multi: false }, function (err, numReplaced) {
            if(err){
                console.error("Failed updating user: " + err);
                req.session.message = "Failed to update user";
                req.session.message_type = "danger";
                res.redirect('/admin/user/edit/' + req.body.user_id);
            }else{
                // show the view
                req.session.message = "User account updated.";
                req.session.message_type = "success";
                res.redirect('/admin/user/edit/' + req.body.user_id);
            }
        });
    });
});

// insert a user
router.post('/user/insert', common.restrict, function(req, res) {
	var bcrypt = req.bcrypt;
	var url = require('url');
	
	// set the account to admin if using the setup form. Eg: First user account
	var url_parts = url.parse(req.header('Referer'));

	var is_admin = "false";
	if(url_parts.path == "/setup"){
		is_admin = "true";
	}
	
	var doc = { 
        users_name: req.body.users_name,
        user_email: req.body.user_email,
		user_password: bcrypt.hashSync(req.body.user_password),
		is_admin: is_admin
	};
	
    // check for existing user
    req.db.users.findOne({'user_email': req.body.user_email}, function (err, user) {
        if(user){
            // user already exists with that email address    
            console.error("Failed to insert user, possibly already exists: " + err);
            req.session.message = "A user with that email address already exists";
            req.session.message_type = "danger";
            res.redirect('/admin/user/new');
            return;
        }else{
            // email is ok to be used.
            req.db.users.insert(doc, function (err, doc) {
                // show the view
                if(err){
                    console.error("Failed to insert user: " + err);
                    req.session.message = "User exists";
                    req.session.message_type = "danger";
                    res.redirect('/admin/user/edit/' + doc._id);
                }else{
                    req.session.message = "User account inserted";
                    req.session.message_type = "success";
                    
                    // if from setup we add user to session and redirect to login.
                    // Otherwise we show users screen
                    if(url_parts.path == "/setup"){
                        req.session.user = req.body.user_email;
                        res.redirect('/login');
                        return;
                    }else{
                        res.redirect('/admin/users');
                        return;
                    }
                }
            });
        }
    });
});

// users
router.get('/user/new', common.restrict, function(req, res) {
    req.db.users.findOne({_id: req.params.id}, function (err, user) {
		res.render('user_new', { 
		  	title: 'User - New',
			user: user,
			session: req.session,
            helpers: req.handlebars.helpers,
            message: common.clear_session_value(req.session, "message"),
			message_type: common.clear_session_value(req.session, "message_type"),
			config: req.config.get('application')
		});
	});
});

// delete user
router.get('/user/delete/:id', common.restrict, function(req, res) {

	// remove the article
	if(req.session.is_admin == "true"){
		req.db.users.remove({_id: req.params.id}, {}, function (err, numRemoved) {			
			req.session.message = "User deleted.";
			req.session.message_type = "success";
			res.redirect("/admin/users");
	  	});
	}else{
		req.session.message = "Access denied.";
		req.session.message_type = "danger";
		res.redirect("/admin/users");
	}
});

// validate the permalink
router.post('/api/validate_permalink', function(req, res){
	// if doc id is provided it checks for permalink in any products other that one provided,
	// else it just checks for any products with that permalink
	var query = {};
	if(req.body.doc_id == ""){
		query = {'product_permalink': req.body.permalink};
	}else{
		query = {'product_permalink': req.body.permalink, $not: { _id: req.body.doc_id }};
	}

	req.db.products.count(query, function (err, products) {
		if(products > 0){
			res.writeHead(400, { 'Content-Type': 'application/text' }); 
			res.end('Permalink already exists');
		}else{
			res.writeHead(200, { 'Content-Type': 'application/text' }); 
			res.end('Permalink validated successfully');
		}
	});
});

// update the published state based on an ajax call from the frontend
router.post('/product/published_state', common.restrict, function(req, res) {
	req.db.products.update({ _id: req.body.id}, { $set: { product_published: req.body.state} }, { multi: false }, function (err, numReplaced) {
		if(err){
			console.error("Failed to update the published state: " + err);
			res.writeHead(400, { 'Content-Type': 'application/text' }); 
			res.end('Published state not updated');
		}else{
			res.writeHead(200, { 'Content-Type': 'application/text' }); 
			res.end('Published state updated');
		}
	});
});	

// set as main product image
router.post('/product/setasmainimage', common.restrict, function(req, res) {
    var fs = require('fs');
    var path = require('path');
    
    // update the product_image to the db
    req.db.products.update({ _id: req.body.product_id}, { $set: { product_image: req.body.product_image} }, { multi: false }, function (err, numReplaced) {
        if(err){
            res.status(400).json({message: 'Unable to set as main image. Please try again.'});
        }else{
            res.status(200).json({message: 'Main image successfully set'});
        }
    });
});


// deletes a product image
router.post('/product/deleteimage', common.restrict, function(req, res) {
    var fs = require('fs');
    var path = require('path');
    
    // get the product_image from the db
    req.db.products.findOne({_id: req.body.product_id}, function (err, product) {
        if(req.body.product_image == product.product_image){
            // set the produt_image to null
            req.db.products.update({ _id: req.body.product_id}, { $set: { product_image: null} }, { multi: false }, function (err, numReplaced) {
                // remove the image from disk
                fs.unlink(path.join("public", req.body.product_image), function(err){
                    if(err){
                        res.status(400).json({message: 'Image not removed, please try again.'});
                    }else{
                        res.status(200).json({message: 'Image successfully deleted'});
                    }
                });
            });
        }else{
            // remove the image from disk
            fs.unlink(path.join("public", req.body.product_image), function(err){
                if(err){
                    res.status(400).json({message: 'Image not removed, please try again.'});
                }else{
                    res.status(200).json({message: 'Image successfully deleted'});
                }
            });
        }
    });
});

// upload the file
var multer  = require('multer')
var upload = multer({ dest: 'public/uploads/' });
router.post('/file/upload', common.restrict, upload.single('upload_file'), function (req, res, next) {
	var fs = require('fs');
    var path = require('path');
	
	if(req.file){
		// check for upload select
		var upload_dir = path.join("public/uploads", req.body.directory);
		
        // Check directory and create (if needed)
        common.check_directory_sync(upload_dir);
		
		var file = req.file;
		var source = fs.createReadStream(file.path);
		var dest = fs.createWriteStream(path.join(upload_dir, file.originalname.replace(/ /g,"_")));

		// save the new file
		source.pipe(dest);
		source.on("end", function() {});

		// delete the temp file.
		fs.unlink(file.path, function (err) {});
	
        // get the product form the DB
        req.db.products.findOne({_id: req.body.directory}, function (err, product) {
            var image_path = path.join("/uploads", req.body.directory, file.originalname.replace(/ /g,"_"));
            
            // if there isn't a product featured image, set this one
            if(!product.product_image){
                req.db.products.update({_id: req.body.directory},{$set: {product_image: image_path}}, { multi: false }, function (err, numReplaced) {
                    req.session.message = "File uploaded successfully";
                    req.session.message_type = "success";
                    res.redirect('/admin/product/edit/' + req.body.directory);
                });
            }else{
                req.session.message = "File uploaded successfully";
                req.session.message_type = "success";
                res.redirect('/admin/product/edit/' + req.body.directory);
            }
        });
	}else{
		req.session.message = "File upload error. Please select a file.";
		req.session.message_type = "danger";
		res.redirect('/admin/product/edit/' + req.body.directory);
	}
});

// delete a file via ajax request
router.post('/file/delete', common.restrict, function(req, res) {
	var fs = require('fs');
	
	req.session.message = null;
	req.session.message_type = null;

	fs.unlink("public/" + req.body.img, function (err) {
		if(err){
			console.error("File delete error: "+ err);
			res.writeHead(400, { 'Content-Type': 'application/text' }); 
            res.end('Failed to delete file: ' + err);
		}else{
			
			res.writeHead(200, { 'Content-Type': 'application/text' }); 
            res.end('File deleted successfully');
		}
	});
});

router.get('/files', common.restrict, function(req, res) {
	var glob = require("glob");
	var fs = require("fs");
	
	// loop files in /public/uploads/
	glob("public/uploads/**", {nosort: true}, function (er, files) {
		
		// sort array
		files.sort();
		
		// declare the array of objects
		var file_list = new Array();
		var dir_list = new Array();
		
		// loop these files
		for (var i = 0; i < files.length; i++) {
			
			// only want files
			if(fs.lstatSync(files[i]).isDirectory() == false){
				// declare the file object and set its values
				var file = {
					id: i,
					path: files[i].substring(6)
				};
				
				// push the file object into the array
				file_list.push(file);
			}else{
				var dir = {
					id: i,
					path: files[i].substring(6)
				};
				
				// push the dir object into the array
				dir_list.push(dir);
			}
		}
		
		// render the files route
		res.render('files', {
			title: 'Files', 
			files: file_list,
			dirs: dir_list,
			session: req.session,
			config: req.config.get('application'),
			message: clear_session_value(req.session, "message"),
			message_type: clear_session_value(req.session, "message_type"),
		});
	});
});

module.exports = router;