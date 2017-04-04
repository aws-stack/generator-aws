var Generator = require('yeoman-generator');
var fs = require('fs');
var yaml = require('js-yaml');
var CIDR = require('node-cidr');

INSTANCE_TYPES = [
  "c1.medium","c1.xlarge",
  "c3.2xlarge","c3.4xlarge","c3.8xlarge","c3.large","c3.xlarge",
  "c4.2xlarge","c4.4xlarge","c4.8xlarge","c4.large","c4.xlarge",
  "cc2.8xlarge",
  "cg1.4xlarge",
  "cr1.8xlarge",
  "d2.2xlarge","d2.4xlarge","d2.8xlarge","d2.xlarge",
  "f1.16xlarge","f1.2xlarge",
  "g2.2xlarge","g2.8xlarge",
  "hi1.4xlarge","hs1.8xlarge",
  "i2.2xlarge","i2.4xlarge","i2.8xlarge","i2.xlarge",
  "i3.16xlarge","i3.2xlarge","i3.4xlarge","i3.8xlarge","i3.large","i3.xlarge",
  "m1.large","m1.medium","m1.small","m1.xlarge",
  "m2.2xlarge","m2.4xlarge","m2.xlarge",
  "m3.2xlarge","m3.large","m3.medium","m3.xlarge",
  "m4.10xlarge","m4.16xlarge","m4.2xlarge","m4.4xlarge","m4.large","m4.xlarge",
  "p2.16xlarge","p2.8xlarge","p2.xlarge",
  "r3.2xlarge","r3.4xlarge","r3.8xlarge","r3.large","r3.xlarge",
  "r4.16xlarge","r4.2xlarge","r4.4xlarge","r4.8xlarge","r4.large","r4.xlarge",
  "t1.micro",
  "t2.2xlarge","t2.large","t2.medium","t2.micro","t2.nano","t2.small","t2.xlarge",
  "x1.16xlarge","x1.32xlarge"
]

VOLUME_TYPES = [ 'gp2', 'io1', 'st1', 'sc1', 'standard' ];

DEVICE_NAMES = [
    "/dev/sda1",
    "/dev/xvdf",
    "/dev/xvdg",
    "/dev/xvdh",
    "/dev/xvdi",
    "/dev/xvdj",
    "/dev/xvdk",
    "/dev/xvdl",
    "/dev/xvdm",
    "/dev/xvdn",
    "/dev/xvdo",
    "/dev/xvdp",
    "/dev/xvdq",
    "/dev/xvdr",
    "/dev/xvds",
    "/dev/xvdt",
    "/dev/xvdu",
    "/dev/xvdv",
    "/dev/xvdw",
    "/dev/xvdx",
    "/dev/xvdy",
    "/dev/xvdz",
];

function loadProject(path, project_name) {
    return yaml.safeLoad(fs.readFileSync(path+'/projects/'+project_name+'.yml'));
};

function validateTag(tag) {
    //TODO: only printable chars, no whitespace
    return true;
};

function validateInstanceType(type) {
  return INSTANCE_TYPES.indexOf(type) > 0 ? true : 'Invalid instance type';
};

function validateInstanceIp(ip) {
    //TODO: make sure the IP is inside the CIDR block of the subnet
    return true;
}

module.exports = class extends Generator {
  constructor(args,opts) {
      super(args,opts);
      this.argument('project', { type: String, required: true });
      this.answers = {};
      this.volumes = {};
      this.volIndex = 0;
  }
  initializing() {
      this.project = loadProject(this.destinationRoot(), this.options['project']);
      this.log(Object.keys(this.project.project.subnets));
  };
  instancePrompt() {
    var done = this.async();
    var questions = [{
      type    : 'input',
      name    : 'name',
      message : 'How the new instance is going to be called?',
      validate: validateTag
    }, {
      type    : 'input', // list didn't work well here because there are too many options
      name    : 'instanceType',
      message : 'What is the instance type for the new instance?',
      default : 't2.micro',
      validate: validateInstanceType
    }, {
      type    : 'input',
      name    : 'key_name',
      message : 'Which key pair should be used in this instance?(empty for none):'
    }, {
      type    : 'input',
      name    : 'ami',
      message : 'What AMI?',
      required: true
    }, {
      type    : 'confirm',
      name    : 'fixedIp',
      message : 'Shall I assign a fixed private IP to this instance?'
    }, {
      type    : 'list',
      name    : 'subnet',
      message : 'Which subnet is best suited for this instance?',
      choices : Object.keys(this.project.project.subnets),
      when    : function(ans) { return ans.fixedIp }
    }, {
      type    : 'input',
      name    : 'privateIp',
      message : 'What IP should I assign to the instance?',
      when    : function(ans) { return ans.fixedIp },
      validate: validateInstanceIp
    }, {
      type    : 'list',
      name    : 'public_ip_type',
      choices : [ { name: 'No public IP', value: 'no'},
                  { name: 'Elastic IP', value: 'eip' },
                  { name: 'Random public IP', value: 'public' }],
      message : 'Should we set a public IP to this instance?'
    }, {
      type    : 'input',
      name    : 'eip',
      message : 'Which pre-existing Elastic IP should be assigned to the instance?',
      when    : (ans) => { return ans.public_ip_type == "eip"; }
    }, {
      type    : 'confirm',
      name    : 'setup_volumes',
      message : 'Want to setup volumes now?'
    }];
    return this.prompt(questions).then((answers) => {
      this.answers = answers;
      if (this.answers.setup_volumes) {
          this._setupVolumes(done, 0);
      }
    });
  };

  _setupVolumes(done, volIndex) {
      let volQuestion = [{
          type   : 'input',
          name   : 'vol_'+volIndex+'_name',
          message: "How should I name volume "+ volIndex + "?",
          default: () => { return volIndex == 0 ? 'root' : 'vol'+volIndex; }
      }, {
          type   : 'input',
          name   : 'vol_'+volIndex+'_size',
          message: "Size of the volume"
      }, {
          type   : 'list',
          choices: DEVICE_NAMES,
          name   : 'vol_'+volIndex+'_device',
          message: "Device name for this volume",
          default: volIndex
      }, {
          type   : 'list',
          choices: VOLUME_TYPES,
          name   : 'vol_'+volIndex+'_type',
          message: "Type of the volume"
      }, {
          type   : 'confirm',
          name   : 'add_another',
          message: "Add another volume?"
      }];
      return this.prompt(volQuestion).then((answers) => {
          this.volumes = Object.assign(this.volumes, answers);
          if (answers.add_another) {
              this._setupVolumes(done, ++volIndex);
          } else done();
      });
  };

  createInstance() {
      this.log(yaml.safeDump(this.answers));
      this.log(yaml.safeDump(this.volumes));
  }
};


