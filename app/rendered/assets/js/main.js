/** SUPERLUMEN - Copyright 2017 Super-Lumen - www.superlumen.org */
var bundle = (function (exports) {
'use strict';

class Randomization {

    /**
     * Returns a whole random number in-between or at "min" and "max" values.
     * @param {Number} min
     * @param {Number} max
     * @returns {Number}
     */
    static number(min, max) {
        let n = Math.round(Math.random() * (max + 1 - min) + min);
        n = n > max ? max : n;
        n = n < min ? min : n;
        return n;
    }

    static newid() {
        return Randomization.number(1000000, 9999999).toString() +
            Math.round(new Date().getTime() * 10000 * Math.random()).toString();
    }
}

/**
 * Utility class that helps facilitate communication between the Electron main process and the rendered content.
 */
class Comm {

    /**
     * Sends a communication to the Electron main process. If a callback function is provided, the function call is
     * made asynchronously, awaiting a response on the same channel.
     * @param {String} channel 
     * @param {*} arg 
     * @param {Function} [callback]
     */
    static send(channel, arg, callback) {
        if (window.ipc) {
            if (callback) {
                window.ipc.send(channel, arg);
                window.ipc.once(channel, callback);
            } else {
                return window.ipc.sendSync(channel, arg);
            }
        } else {
            throw new Error('IPC not set - did the preload script run?');
        }
    }

}

/**
 * This is an abstract (non-initializable) class definition to be extended by an implementing view model class.
 * @class
 */
class ViewModel {

    /**
     * Constructs a ViewModel object, should only be called by an extending class via 'super'.
     */
    constructor() {
        //validated
        if (new.target === ViewModel) {
            throw new Error('ViewModel is an abstract class and should not be initiated alone.');
        } else if (typeof this.constructor.init !== 'function') {
            throw new Error('Static function "init" must be implemented on the extending class.');
        } else if (typeof this.render !== 'function') {
            throw new Error('Function "render" must be implemented on the extending class.');
        }
        this.id = ViewModel.newid();
        this.parent = null;
        this.children = [];
        this.element = null;
        this.config = null;
        //setup events and listeners
        if (window && window.document) {
            //fire render when the DOM is ready
            var self = this;
            document.addEventListener("DOMContentLoaded", function () {
                var classes = document.getElementsByTagName('body')[0].classList.add('view-ready');
                //get the configuration
                Comm.send('Wire', { path: 'config.read' }, function (e, arg) {
                    self.config = arg.model;
                    self.render();
                });
            });
        }
    }

    /**
     * Generates a new ID that can be used for a view.
     * @returns {String}
     */
    static newid() {
        let id = Randomization.newid();
        return id;
    }

    /**
     * Returns the view-model set on the HTML body, indicating the default view-model to initaialize.
     */
    static bodyViewModel() {
        return document.getElementsByTagName('body')[0]
            .getAttribute('data-view-model');
    }

    /**
     * Adds a viewmodel to this one and renders under the specified element.
     * @param {String} mvvm - The name of the mvvm to load.
     * @param {String|HTMLElement} element 
     * @param {String} [id] - Optional id of the viewmodel entry. If not specified, a random value is chosen.
     */
    add(mvvm, element, id) {
        if (typeof mvvm !== 'string') {
            throw new Error('Argument "mvvm" must be a string.');
        }
        if (typeof element === 'string') {
            element = document.querySelector(element);
        }
        if (element instanceof HTMLElement === false) {
            throw new Error('Argument "element" was not an HTMLElement or could not be found by selector query.');
        }
        //locate and load the view and view-model into the element.
        var mvvmDir = path.resolve(path.join(path.dirname(this.fileName), '..', mvvm));

        //look for a view-model file
        let vmFilePath = path.join(mvvmDir, 'view-model.js');
        if (fs.existsSync(vmFilePath)) {
            //setup
            if (this.children == null || Array.isArray(this.children) === false) {
                this.children = [];
            }
            var id = (id || ViewModel.newid());
            if (this.contains(id)) {
                throw new Error('The id specified is already in use.');
            }
            let div = document.createElement('div');
            div.className = 'view view-' + mvvm;
            div.innerHTML = fs.readFileSync(path.join(mvvmDir, 'view.html'), 'utf8');
            div.id = 'view-' + id;
            div.setAttribute('data-view-model-id', id);
            //insert into the element
            element.appendChild(div);
            element.className = "active-" + mvvm;
            //autoload and setup the view-model
            let viewmodel = require(vmFilePath).init();
            viewmodel.id = id;
            viewmodel.parent = this;
            viewmodel.element = div;
            //add the view-model to this view-model's children
            this.children.push(viewmodel);
            //check if the document ready-state has already fired
            if (window && window.document) {
                if (document.getElementsByTagName('body')[0].classList.contains('view-ready')) {
                    viewmodel.render();
                }
            }
            return viewmodel;
        }
        throw new Error(`A view-model could not be found under the mvvm "${mvvm}"`);
    }

    /**
     * Removes a child viewmodel by the viewmodel id or instance.
     * @param {String|ViewModel} vmid - The id of the viewmodel or a viewmodel instance.
     * @returns {Boolean} - Returns true if a viewmodel was found and removed. 
     */
    remove(vmid) {
        if (this.children) {
            var isObj = (typeof vmid === 'object');
            for (var x = 0; x < this.children.length; x++) {
                if ((isObj && vmid == this.children[x]) || (isObj === false && this.children[x].id === vmid)) {
                    this.children[x].teardown();
                    this.children.splice(x, 1);
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Removes all child viewmodels.
     */
    removeAll() {
        if (this.children) {
            for (var x = 0; x < this.children.length; x++) {
                this.children[x].teardown();
            }
            this.children.length = 0;
        }
    }

    /**
     * Checks if the given child viewmodel exists by the viewmodel id or instance.
     * @param {String|ViewModel} vmid - The id of the viewmodel or a viewmodel instance.
     * @returns {Boolean}
     */
    contains(vmid) {
        if (this.children) {
            var isObj = (typeof vmid === 'object');
            for (var x = 0; x < this.children.length; x++) {
                if ((isObj && vmid == this.children[x]) || (isObj === false && this.children[x].id === vmid)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Called by a viewmodel parent when the view is about to be removed from the collection. 
     */
    teardown() {
        //delete the containing html element
        if (this.element) {
            this.element.remove();
        }
        //clear the parent
        this.parent = null;
    }

}

class AboutViewModel extends ViewModel {
    constructor() {
        super();
    }

    static init() {
        return new AboutViewModel();
    }

    render() {
        $('.button-close').click(this, this.onCloseClick);
    }

    onCloseClick(e) {
        window.close();
    }

}

/**
 * Utility class that provides functions for validating and working with secure information.
 */
class Security {

    /**
     * @typedef {Object} StrengthRank
     * @property {String} label - The label of the level of strength.
     * @property {Number} rank - The relative strength of the password as a fraction (0-1) with 1 being the strongest.
     */

    /**
     * Evaluates the given password for strength. Returns a strength label and fractional rank (0-1). 
     * @param {String} password 
     * @returns {StrengthRank}
     */
    static strength(password) {
        let lccCount = password.replace(/[^a-z]/g, '').length;
        let uccCount = password.replace(/[^A-Z]/g, '').length;
        let numCount = password.replace(/[^0-9]/g, '').length;
        let splCount = password.replace(/[a-zA-Z\d\s]/g, '').length;
        if (!password) {
            return { label: 'None', rank: 0 };
        }
        let unqChars = [];
        for (let x = 0; x < password.length; x++) {
            if (unqChars.indexOf(password[x]) === -1) {
                unqChars.push(password[x]);
            }
        }
        // console.log(`Strength:
        //     Length: ${(password.length > 14 ? 1 : password.length / 14)}
        //     Unique: ${(unqChars.length > 14 ? 1 : unqChars.length / 14)}
        //     `);
        let strength =
            ((password.length > 14 ? 1 : password.length / 14) * 0.3) + 
            ((unqChars.length > 14 ? 1 : unqChars.length / 14) * 0.45) +
            ((
                (lccCount > 0 ? 0.25 : 0) +
                (uccCount > 0 ? 0.25 : 0) +
                (numCount > 0 ? 0.25 : 0) +
                (splCount > 0 ? 0.25 : 0)
            ) * 0.25);
        if (strength <= Security.StrengthNone) {
            return { label: 'None', rank: strength };
        } else if (strength <= Security.StrengthWeak) {
            return { label: 'Weak', rank: strength };
        } else if (strength <= Security.StrengthMedium) {
            return { label: 'Medium', rank: strength };
        } else if (strength <= Security.StrengthStrong) {
            return { label: 'Strong', rank: strength };
        } else if (strength <= Security.StrengthGreat) {
            return { label: 'Great', rank: strength };
        } else {
            return { label: 'Superlumenal', rank: strength };
        }
    }

}

Security.StrengthNone = 0.2;
Security.StrengthWeak= 0.5;
Security.StrengthMedium = 0.65;
Security.StrengthStrong = 0.75;
Security.StrengthGreat = 0.85;
Security.StrengthSuperlumenal = 1;

class WalletCreateModel {
    constructor() {

        this.questions = [];

        this.answers = [];
        
    }
}

const MinQuestions = 5;
const MaxQuestions = 20;

class RecoveryQuestionsViewModel extends ViewModel {
    constructor() {
        super();

        this.model = new WalletCreateModel();
    }

    static init() {
        return new RecoveryQuestionsViewModel();
    }

    render() {
        let self = this;
        //add a q/a
        Comm.send('Wire', { path: 'recovery.read' }, function (e, arg) {
            if (arg && arg.model && arg.model.questions && arg.model.questions.length) {
                for (let x = 0; x < arg.model.questions.length; x++) {
                    let q = arg.model.questions[x];
                    let a = arg.model.answers[x];
                    let tr = self.addQARow(false, false);
                    tr.find('.question').val(q);
                    tr.find('.answer').val(a);
                }
                self.updateModel();
                self.updateMetrics();
            } else {
                for (let x = 0; x < MinQuestions; x++) {
                    self.addQARow(false, false);
                }
            }
        });
        //focus first input
        $('input:visible:first').focus().select();
        //help
        $('#link-help-guidelines').click(this, this.onHelpGuidelinesClick);
        //handle questions
        $('.button-add-qa').click(this, this.onAddQAClick);
        //footer buttons
        $('.button-cancel').click(this, this.onCancelClick);
        $('.button-save').click(this, this.onSaveClick);
    }

    onHelpGuidelinesClick(e) {
        $('#help-guidelines').fadeToggle();
    }

    onDeleteQAClick(e) {
        let self = e.data;
        $(this).closest('tr').remove();
        let qaCount = $('table.list tbody tr').length;
        $('.button-add-qa').prop('disabled', (qaCount >= MaxQuestions));
        self.updateMetrics();
    }

    onAddQAClick(e) {
        let self = e.data;
        self.addQARow(true, true);
    }

    onQAKeypress(e) {
        let self = e.data;
        self.updateMetrics();
    }

    onCancelClick(e) {
        window.close();
    }

    onRemoveClick(e) {
        let self = e.data;
        //clear q & a
        self.model.questions = [];
        self.model.answers = [];
        //TODO
        window.close();
    }

    onSaveClick(e) {
        let self = e.data;
        let str = self.updateMetrics();
        self.updateModel();
        if (self.model.answers.length < MinQuestions) {
            alert(`At least ${MinQuestions} questions must be configured.`);
            return;
        } else if (str.rank <= Security.StrengthWeak) {
            alert(`Your total answer strength is too weak. Recovery records must have at least medium strength protection.`);
            return;
        }
        Comm.send('Wire', { path: 'recovery.save', args: [self.model] }, function (e, arg) {
            if (arg) {
                if (arg.errors.length) {
                    alert('Failed to save the recovery record:\n' + arg.errors.join('\n'));
                } else {
                    window.close();
                }
            } else {
                alert('Unable to save recovery record settings due to the wallet being locked or unavailable.');
            }
        });
    }

    /**
     * Updates the user interface with the current strength and Q&A metrics.
     * @returns {Security.StrengthRank}
     */
    updateMetrics() {
        let count = 0;
        let concatpw = '';
        //get count
        $('table.list tr').each(function () {
            let q = $(this).find('.question').val();
            let a = $(this).find('.answer').val();
            if (q && a) {
                count++;
                concatpw += a;
            }
        });
        //get strength
        let str = Security.strength(concatpw);
        //update UI
        $('.span-answer-count').text(count);
        $('.span-answer-strength').text(str.label);
        $('.button-save').prop('disabled', (count < 5));
        return str;
    }

    /**
     * Updates the model object with values from the DOM.
     */
    updateModel() {
        let self = this;
        self.model.questions = [];
        self.model.answers = [];
        $('table.list tr').each(function () {
            let q = $(this).find('.question').val();
            let a = $(this).find('.answer').val();
            if (q && a) {
                self.model.questions.push(q);
                self.model.answers.push(a);
            }
        });
    }

    /**
     * Adds a new Q & A row to the table.
     * @param {Boolean} focus - If true, the new question input will be focused.
     * @param {Boolean} scroll - If true, the document will scroll to the newly inserted row
     */
    addQARow(focus, scroll) {
        let qaCount = $('table.list tbody tr').length;
        if (qaCount < MaxQuestions) {
            let html = `<tr>
                <td><input type="text" class="question" placeholder="Enter: Question" maxlength="128" /></td>
                <td><input type="text" class="answer" placeholder="Enter: Answer" maxlength="896" /></td>
                <td class="text-right"><button class="button"><i class="fa fa-trash"></i></button></td>
            </tr>`;
            let tr = $(html);
            tr.find('.question, .answer').keyup(this, this.onQAKeypress);
            tr.find('button').click(this, this.onDeleteQAClick);
            $('table.list tbody').append(tr);
            if (scroll) {
                console.log('shouldnt happen');
                window.scrollTo(0, document.body.scrollHeight);
            }
            if (focus) {
                tr.find('input:first').focus();
            }
            qaCount++;
            return tr;
        }
        $('.button-add-qa').prop('disabled', (qaCount >= MaxQuestions));
        return null;
    }

}

/**
 * This is an abstract (non-initializable) class definition to be extended by an implementing component class.
 * @class
 */
class Component {

    /**
     * Constructs a ViewModel object, should only be called by an extending class via 'super'.
     */
    constructor() {
        //validated
        if (new.target === Component) {
            throw new Error('Component is an abstract class and should not be initiated alone.');
        } else if (typeof this.bind !== 'function') {
            throw new Error('Function "bind" must be implemented on the extending class.');
        }
    }

}

/**
 * Provides logic to transition from one wizard step (section) to another.
 * @class
 */
class Wizard extends Component {
    constructor(container) {
        super();
        if ($(container).length === 0) {
            throw new Error('Invalid wizard container element.');
        }

        this.container = $(container);

        //ensure a step is active.
        if (!this.container.find('>.wizard-step.active').length) {
            this.goTo(0);
        }
    }

    bind() {
        this.container.find('>.wizard-step .button-next').click(this, this.onNext);
        this.container.find('>.wizard-step .button-back').click(this, this.onBack);
        //handle "ENTER" clicks
        this.container.find('>.wizard-step').find('input,select,textarea').keypress(this, this.onEnter);
        $('body').keypress(this, this.onEnter);
        return this;
    }

    onEnter(e) {
        let self = e.data;
        if (self.container.is(':visible') && (e.keyCode === 13 || e.which === 13)) {
            if (document.activeElement.tagName.match(/input|select|textarea|body/i)) {
                let nextButton = self.container.find('>.wizard-step.active').closest('.wizard-step').find('.button-next');
                if (!nextButton.prop('disabled')) {
                    nextButton.click();
                    e.preventDefault();
                    return false;
                }
            }
        }
    }

    onNext(e) {
        let self = e.data;
        if (!e.isDefaultPrevented()) {
            self.next();
        }
    }

    onBack(e) {
        let self = e.data;
        if (!e.isDefaultPrevented()) {
            self.back();
        }
    }

    next() {
        let steps = this.container.find('>.wizard-step');
        let activeIndex = steps.index(this.container.find('>.wizard-step.active'));
        let maxIndex = this.container.find('>.wizard-step').length - 1;
        if (activeIndex < maxIndex) {
            this.goTo(++activeIndex);
        }
    }

    back() {
        let steps = this.container.find('>.wizard-step');
        let activeIndex = steps.index(this.container.find('>.wizard-step.active'));
        if (activeIndex > 0) {
            this.goTo(--activeIndex);
        }
    }

    goTo(step) {
        let steps = this.container.find('>.wizard-step');
        let activeIndex = steps.index(this.container.find('>.wizard-step.active'));
        let targetIndex = -1;
        let target = null;
        if (typeof step === 'number') {
            targetIndex = step;
            target = $(steps[targetIndex]);
        } else {
            target = $(step);
            targetIndex = steps.index(target);
        }
        if (targetIndex < 0) {
            throw new Error(`Unable to find wizard step at index ${targetIndex}.`);
        } else if (activeIndex !== targetIndex) {
            this.container.find('>.wizard-step.active').removeClass('active');
            target.addClass('active');
            target.find('.wizard-default-focus').focus().select();
        }
    }

    goToStart() {
        this.goTo(0);
    }

    goToEnd() {
        this.goTo(this.container.find('>.wizard-step').length - 1);
    }
}

class WalletCreateViewModel extends ViewModel {
    constructor() {
        super();
    }

    static init() {
        return new WalletCreateViewModel();
    }

    render() {
        $('input:visible:first').focus().select();
        //open wallet link
        $('#link-open-wallet').click(this, this.onOpenWalletClick);
        //password section
        $('.wizard-step-password input[name="text-password"]').change(this, this.onPasswordChange);
        $('.wizard-step-password input[name="text-password"]').keyup(this, this.onPasswordChange);
        $('.wizard-step-password input[name="text-password-confirm"]').change(this, this.onPasswordConfirmChange);
        $('.wizard-step-password input[name="text-password-confirm"]').keyup(this, this.onPasswordConfirmChange);
        $('.wizard-step-password .button-key-file').click(this, this.onKeyFileClick);
        $('.wizard-step-password .button-key-file-generate').click(this, this.onKeyFileGenerateClick);
        $('.wizard-step-password .button-key-file-about').click(this, this.onKeyFileAboutClick);
        $('.wizard-step-password .button-next').click(this, this.onPasswordNextClick);
        //recovery
        $('.wizard-step-recovery input[type="checkbox"]').change(this, this.onRecoveryChecked);
        $('.wizard-step-recovery .button-setup-recovery').click(this, this.onConfigureRecovery);
        //accounts
        $('.wizard-step-accounts input[type="checkbox"]').change(this, this.onNewAccountChecked);
        $('.wizard-step-accounts .button-refresh-account').click(this, this.onRefreshAccountClick);
        $('.wizard-step-accounts .button-account-id-copy').click(this, this.onAccountIDCopy);
        $('.wizard-step-accounts .button-account-secret-copy').click(this, this.onAccountSecretCopy);
        $('.wizard-step-accounts .button-complete').click(this, this.onCompleteClick);
        //populate networks
        if (this.config && this.config.networks) {
            for (let x = 0; x < this.config.networks.length; x++) {
                let nw = this.config.networks[x];
                let opt = $(`<option value="${nw.url}">${nw.label}</option>`).prop('selected', !!nw.default);
                let select = $('.wizard-step-accounts #select-account-network');
                opt.appendTo(select);
            }
        }
        //generate a new address
        this.onRefreshAccountClick();
        //bind the wizard component
        this.wizard = new Wizard($('.wizard')).bind();
    }

    onOpenWalletClick(e) {
        Comm.send('MainWindow.openWallet', null, function (e, arg) {
            if (arg) {
                $('.view').fadeOut(function () {
                    Comm.send('MainWindow.loadTemplate', 'wallet-open');
                });
            }
        });
    }

    onPasswordChange(e) {
        var self = e.data;
        let pw = $('input[name="text-password"]').val();
        if (pw) {
            let strength = Security.strength(pw);
            $('.wizard-step-password .progress').removeClass('alert warning primary');
            if (strength.rank <= Security.StrengthWeak) {
                $('.progress').addClass('alert');
            } else if (strength.rank <= Security.StrengthMedium) {
                $('.progress').addClass('warning');
            } else {
                $('.progress').addClass('primary');
            }
            $('.wizard-step-password .progress .progress-meter')
                .data('strength', strength.rank)
                .css('width', (strength.rank * 100) + '%');
            $('.wizard-step-password .progress .progress-meter-text').text(strength.label);
        } else {
            $('.wizard-step-password .progress .progress-meter').data('strength', 0);
        }
        self.onPasswordConfirmChange(e);
    }

    onPasswordConfirmChange(e) {
        let pw = $('.wizard-step-password input[name="text-password"]');
        let cpw = $('.wizard-step-password input[name="text-password-confirm"]');
        let confirmed = (pw.val() === cpw.val());
        $('.wizard-step-password .button-next').prop('disabled', !(confirmed && pw.val()));
        if (confirmed) {
            $(cpw).siblings('.input-group-label')
                .find('.fa')
                .removeClass('fa-warning')
                .addClass('fa-check');
        } else {
            $(cpw).siblings('.input-group-label')
                .find('.fa')
                .removeClass('fa-check')
                .addClass('fa-warning');
        }
    }

    onKeyFileClick(e) {
        let self = e.data;
        let parent = self.parent; //hold onto ref after this view's teardown
        let button = $('.button-key-file');
        if (button.text() == 'Select Key-File') {
            Comm.send('MainWindow.openKeyFile', null, function (e, arg) {
                if (arg && arg.valid) {
                    button
                        .data('file-name', arg.keyFileName)
                        .text('Remove Key-File')
                        .removeClass('fa-key')
                        .addClass('fa-trash');
                    $('.wizard-step-password .button-key-file-generate').prop('disabled', button.data('file-name'));
                }
            });
        } else {
            button.data('file-name', '')
                .text('Select Key-File')
                .removeClass('fa-trash')
                .addClass('fa-key');
            $('.wizard-step-password .button-key-file-generate').prop('disabled', button.data('file-name'));
        }
        e.preventDefault();
        return false;
    }

    onKeyFileGenerateClick(e) {
        let self = e.data;
        let parent = self.parent; //hold onto ref after this view's teardown
        Comm.send('MainWindow.saveKeyFile', null, function (e, arg) {
            if (arg && arg.valid) {
                $('.wizard-step-password .button-key-file')
                    .data('file-name', arg.keyFileName)
                    .text('Remove Key-File')
                    .removeClass('fa-key')
                    .addClass('fa-trash');
                $('.wizard-step-password .button-key-file-generate').prop('disabled', true);
            }
        });
    }

    onKeyFileAboutClick(e) {
        alert(`A key-file is a small file containing random data. Key-files drastically increase the strength of the encryption used on your wallet, but you must always have access to the key-file when opening your wallet.\n\nLike passwords, you should keep the key-file secure and hidden away.`);
    }

    onPasswordNextClick(e) {
        let self = e.data;
        let pw = $('.wizard-step-password input[name="text-password"]').val();
        let kf = $('.wizard-step-password .button-key-file').data('file-name');
        let strength = $('.wizard-step-password .progress .progress-meter').data('strength');
        if (strength < Security.StrengthWeak) {
            if (!confirm('Your password is weak, are you sure you want to continue?')) {
                $('.wizard-step-password input[name="text-password"]').focus().select();
                e.preventDefault();
                return false;
            }
        }
        Comm.send('Wire', {
            path: 'wallet.save', args: [{
                label: 'My Wallet',
                password: pw,
                keyFilePath: kf
            }]
        }, function (e, arg) {
            if (arg && arg.errors && arg.errors.length) {
                console.error(arg.errors);
                alert('Unable to set password and/or key file:\n' + arg.errors.join(';\n'));
                self.wizard.back();
            }
        });
    }

    onRecoveryChecked(e) {
        let recoveryEnabled = $('.wizard-step-recovery input[type="checkbox"]').is(':checked');
        let hasQA = $('.wizard-step-recovery .button-setup-recovery').data('hasQA');
        $('.wizard-step-recovery .button-next').prop('disabled', recoveryEnabled && !hasQA);
        $('.wizard-step-recovery .button-setup-recovery').prop('disabled', !recoveryEnabled);
    }

    onConfigureRecovery(e) {
        let self = e.data;
        let parent = self.parent; //hold onto ref after this view's teardown
        Comm.send('MainWindow.showRecoveryQuestions', null, function (e, arg) {
            $('.wizard-step-recovery .button-next').prop('disabled', !(arg && arg.qa > 0));
            $('.wizard-step-recovery .button-setup-recovery').data('hasQA', (arg && arg.qa > 0));
        });
    }

    onNewAccountChecked(e) {
        let self = e.data;
        let newAccount = $('.wizard-step-accounts input[type="checkbox"]').is(':checked');
        $('.wizard-step-accounts .text-account-id').prop('readonly', newAccount).val('');
        $('.wizard-step-accounts .text-account-secret').prop('readonly', newAccount).val('');
        if (newAccount) {
            self.onRefreshAccountClick();
            $('.wizard-step-accounts .button-refresh-account').show();
        } else {
            $('.wizard-step-accounts .button-refresh-account').hide();
        }
    }

    onRefreshAccountClick(e) {
        Comm.send('Wire', { path: 'accounts.gen' }, function (ev, arg) {
            $('.wizard-step-accounts .text-account-id').val(arg.model.publicKey);
            $('.wizard-step-accounts .text-account-secret').val(arg.model.privateKey);
        });
    }

    onAccountIDCopy(e) {
        let text = $('.wizard-step-accounts .text-account-id').val();
        Comm.send('MainWindow.clipboard', { data: text, type: 'text', title: 'Superlumen: Clipboard', message: 'Account ID copied to clipboard.' });
    }

    onAccountSecretCopy(e) {
        let text = $('.wizard-step-accounts .text-account-secret').val();
        Comm.send('MainWindow.clipboard', { data: text, type: 'text', title: 'Superlumen: Clipboard', message: 'Secret copied to clipboard.' });
    }

    onCompleteClick(e) {
        let self = e.data;
        let accountID = $('.wizard-step-accounts .text-account-id').val().trim();
        let secret = $('.wizard-step-accounts .text-account-secret').val().trim();
        let networkElement = $('.select-account-network option:selected');
        let network = {
            label: networkElement.text(),
            url: networkElement.val()
        };
        Comm.send('Wire', { path: 'accounts.verify', args: [accountID, secret] }, function (ev, arg) {
            if (arg.model) {
                Comm.send('Wire', { path: 'accounts.save', args: [{
                    label: 'My Account',
                    publicKey: accountID,
                    privateKey: secret,
                    network: network
                }] }, function (ev2, arg2) {
                    alert('save!');
                });
            } else {
                alert('The Account ID or Secret is not valid.');
                $('.wizard-step-accounts .text-account-id').focus().select();
            }
        });
    }

}

const ApplicationViewModels = {
    /* The following tag is automatically replaced by rollup with key/values of each view-model 
       detected in the "templates" directory. */
    "./about/": AboutViewModel,
    "./recovery-questions/": RecoveryQuestionsViewModel,
    "./wallet-create/": WalletCreateViewModel
};

//Perform automatic load based on URL location.
if (window.location) {
    let href = window.location.href;
    let tmpPath = 'templates/';
    let tmpIndex = href.indexOf(tmpPath);
    if (tmpIndex >= 0) {
        href = './' + href.substring(tmpIndex + tmpPath.length);
        //remove the last path segment
        href = href.substring(0, href.lastIndexOf('/') + 1);
        if (ApplicationViewModels[href] && ApplicationViewModels[href].init) {
            ApplicationViewModels[href].init();
        } else {
            console.info('No view-model found for path "' + href + '".');
        }
    }
}

return exports;

}({}));
//# sourceMappingURL=main.js.map
